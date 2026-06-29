/**
 * Primitive color scales — tier 1 tokens.
 *
 * These are raw scales. UI code should NEVER reference these directly; it should
 * consume semantic tokens from ../semantic. Primitives exist to seed CSS variables
 * and to serve as a single source of truth shared with the Tailwind preset.
 *
 * Naming: kebab-case keys are NOT used; we keep numeric step keys (50, 100, …, 950)
 * to match Tailwind's mental model.
 *
 * Hex values are anchored in the blueprint. Do not adjust without revisiting §4.
 */

export const ink = {
  50: "#F7F7F4",
  100: "#EDEDE8",
  200: "#D9D9D2",
  300: "#B9B9AF",
  400: "#8C8C82",
  500: "#5E5E55",
  600: "#3F3F38",
  700: "#2A2A25",
  800: "#1A1A17",
  900: "#0F0F0D",
  950: "#070706",
} as const;

export const paper = {
  0: "#FFFFFF",
  50: "#FCFCF9",
  100: "#F7F7F2",
  200: "#EFEFE8",
  300: "#E4E4DB",
  400: "#D2D2C7",
} as const;

export const indigo = {
  50: "#F1F3F9",
  100: "#DEE3F0",
  200: "#B9C3DF",
  300: "#8A9BC8",
  400: "#5F76AE",
  500: "#3B5394",
  600: "#2A3F7A",
  700: "#1F3060",
  800: "#172547",
  900: "#101A33",
} as const;

// Status families — low chroma, on-brand
export const sage = {
  50: "#F0F5EE",
  100: "#DDE9D9",
  200: "#C6D9C0",
  300: "#A4C19B",
  400: "#7BA46F",
  500: "#5C8C50",
  600: "#456A3D",
  700: "#34552C",
  800: "#243C1F",
  900: "#152613",
} as const;

export const ochre = {
  50: "#FAF4E8",
  100: "#F4E8CC",
  200: "#EAD8A8",
  300: "#DCC07C",
  400: "#C9A552",
  500: "#B58A2F",
  600: "#946D1F",
  700: "#724F0E",
  800: "#523807",
  900: "#332300",
} as const;

export const madder = {
  50: "#F8EEEA",
  100: "#F0DBD2",
  200: "#E6BFAE",
  300: "#D69A82",
  400: "#BE6F4F",
  500: "#A14826",
  600: "#7E351A",
  700: "#5E2510",
  800: "#3E180A",
  900: "#250E05",
} as const;

export const slateCool = {
  50: "#EEF0F2",
  100: "#DDE2E6",
  200: "#C5CDD4",
  300: "#A3AEB8",
  400: "#7B8A96",
  500: "#5A6B7A",
  600: "#445462",
  700: "#2F3D4A",
  800: "#1F2A33",
  900: "#10171E",
} as const;

/**
 * Pure black is reserved for the brand monogram only. Pure white is reserved
 * for image plates (product photography backgrounds). Use ink/900 and paper/0
 * everywhere else.
 */
export const reservedBlack = "#000000" as const;

export type Scale = Record<string | number, string>;

export const primitives = {
  ink,
  paper,
  indigo,
  sage,
  ochre,
  madder,
  slateCool,
} as const;

export type Primitives = typeof primitives;
