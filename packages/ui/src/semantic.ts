/**
 * Semantic tokens — tier 2.
 *
 * Maps roles (e.g. surface.background, action.primary.background) to primitive
 * hex values. Both light and dark resolutions are defined; the CSS variable
 * layer in styles.css switches between them at runtime via [data-theme].
 *
 * Components in apps SHOULD NOT import this file directly — they consume
 * Tailwind utilities that resolve through the CSS variables. This file exists
 * for:
 *   1. Generating styles.css (single source of truth)
 *   2. Type-safe utilities that need hex (e.g. Framer Motion color animations)
 *   3. Documentation
 */

import { ink, paper, indigo, sage, ochre, madder, slateCool } from "./tokens/colors";

export type SemanticTokens = {
  surface: {
    background: string;
    raised: string;
    sunken: string;
    overlay: string;
    inverse: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    disabled: string;
    onAccent: string;
    onInverse: string;
  };
  border: {
    subtle: string;
    strong: string;
    focus: string;
    inverse: string;
  };
  action: {
    primaryBackground: string;
    primaryBackgroundHover: string;
    primaryBackgroundActive: string;
    primaryText: string;
    secondaryBackground: string;
    secondaryBackgroundHover: string;
    secondaryText: string;
    dangerBackground: string;
    dangerBackgroundHover: string;
    dangerText: string;
  };
  feedback: {
    successBackground: string;
    successText: string;
    successBorder: string;
    warningBackground: string;
    warningText: string;
    warningBorder: string;
    dangerBackground: string;
    dangerText: string;
    dangerBorder: string;
    infoBackground: string;
    infoText: string;
    infoBorder: string;
  };
  brand: {
    accent: string;
    accentMuted: string;
    accentSurface: string;
  };
  imagePlate: string; // always pure white — product photography background
};

export const lightTokens: SemanticTokens = {
  surface: {
    background: paper[50],
    raised: paper[0],
    sunken: paper[100],
    overlay: "rgba(15, 15, 13, 0.40)",
    inverse: ink[900],
  },
  text: {
    primary: ink[900],
    secondary: ink[600],
    muted: ink[500],
    disabled: ink[300],
    onAccent: paper[0],
    onInverse: paper[50],
  },
  border: {
    subtle: paper[300],
    strong: paper[400],
    focus: indigo[600],
    inverse: ink[700],
  },
  action: {
    primaryBackground: indigo[600],
    primaryBackgroundHover: indigo[700],
    primaryBackgroundActive: indigo[800],
    primaryText: paper[0],
    secondaryBackground: paper[0],
    secondaryBackgroundHover: paper[100],
    secondaryText: ink[900],
    dangerBackground: madder[500],
    dangerBackgroundHover: madder[600],
    dangerText: paper[0],
  },
  feedback: {
    successBackground: sage[50],
    successText: sage[700],
    successBorder: sage[200],
    warningBackground: ochre[50],
    warningText: ochre[700],
    warningBorder: ochre[200],
    dangerBackground: madder[50],
    dangerText: madder[700],
    dangerBorder: madder[200],
    infoBackground: slateCool[50],
    infoText: slateCool[700],
    infoBorder: slateCool[200],
  },
  brand: {
    accent: indigo[600],
    accentMuted: indigo[400],
    accentSurface: indigo[50],
  },
  imagePlate: paper[0],
};

/**
 * Dark mode anchors. Accents lift in lightness so they keep AA contrast
 * against near-black surfaces. Photographs sit on white plates that stay
 * white — `imagePlate` is identical in both modes.
 */
export const darkTokens: SemanticTokens = {
  surface: {
    background: "#0B0C0E",
    raised: "#15161A",
    sunken: "#0E0F12",
    overlay: "rgba(0, 0, 0, 0.60)",
    inverse: paper[50],
  },
  text: {
    primary: "#F2F2EF",
    secondary: "#B6B7B0",
    muted: "#7B7C75",
    disabled: "#4A4B45",
    onAccent: "#0B0C0E",
    onInverse: ink[900],
  },
  border: {
    subtle: "#24262C",
    strong: "#34373F",
    focus: "#7A93D6",
    inverse: paper[200],
  },
  action: {
    primaryBackground: "#7A93D6",
    primaryBackgroundHover: "#8FA5DE",
    primaryBackgroundActive: "#6680C5",
    primaryText: "#0B0C0E",
    secondaryBackground: "#1B1D22",
    secondaryBackgroundHover: "#22252B",
    secondaryText: "#F2F2EF",
    dangerBackground: "#C46A4A",
    dangerBackgroundHover: "#D78064",
    dangerText: "#0B0C0E",
  },
  feedback: {
    successBackground: "#1A2A18",
    successText: "#9CC094",
    successBorder: "#2B4426",
    warningBackground: "#2A2210",
    warningText: "#E0BC72",
    warningBorder: "#4A3A14",
    dangerBackground: "#2A1610",
    dangerText: "#E08B6A",
    dangerBorder: "#4A2418",
    infoBackground: "#161B20",
    infoText: "#9DAAB6",
    infoBorder: "#2A333D",
  },
  brand: {
    accent: "#7A93D6",
    accentMuted: "#5F76AE",
    accentSurface: "#171F33",
  },
  imagePlate: paper[0],
};

export type ThemeMode = "light" | "dark";

export const themes: Record<ThemeMode, SemanticTokens> = {
  light: lightTokens,
  dark: darkTokens,
};
