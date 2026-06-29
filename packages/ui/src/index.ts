/**
 * @risitex/ui — design system entrypoint.
 *
 * Public surface (for the storefront, admin extensions, marketing site, etc.):
 *   1. Design tokens (primitives + semantic). Use these in code that needs
 *      mode-fixed values (Framer Motion color animations, canvas, OG images).
 *   2. Tailwind preset (default export from `./tailwind/preset`). Use this in
 *      every consuming app's tailwind.config.
 *   3. Stylesheet (`./styles.css`). Import once at app root to install the CSS
 *      variable layer that Tailwind utilities resolve against.
 *
 * Component primitives (Button, Card, MoneyInput, MatrixOrderGrid, …) will
 * land in subsequent phases; the package is intentionally tokens-first so
 * shape can be exercised by both the storefront build and the admin re-skin
 * before any component contract is frozen.
 */

export const RISITEX_UI_VERSION = "0.1.0";

// Tokens
export * from "./tokens";

// Semantic theme objects (for code that wants resolved hex values)
export * from "./semantic";
