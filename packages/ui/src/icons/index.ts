/**
 * Icon system — Lucide as base + custom RISITEX glyphs for textile-domain
 * concepts. All icons share: 1.5px stroke, round caps/joins, currentColor
 * inheritance, 24px grid.
 *
 * Consumers either import from this barrel (re-exports lucide-react plus the
 * custom set) or directly from `lucide-react` for the rest of the catalogue.
 */

// Re-export every Lucide icon by name for convenience.
export * from "lucide-react";

// Custom RISITEX glyphs (named to avoid collision with Lucide's set).
export * from "./custom/bolt-of-fabric";
export * from "./custom/swatch";
export * from "./custom/weave";
export * from "./custom/carton";
export * from "./custom/matrix-grid";
export * from "./custom/moq";
export * from "./custom/gstin";
export * from "./custom/tier";
export * from "./custom/dimension";
