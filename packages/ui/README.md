# @risitex/ui

The RISITEX design system. Tokens, CSS variables, Tailwind preset. Component primitives land in subsequent phases.

This package is the single source of truth for the design language documented in the RISITEX Design Blueprint. Both the storefront and the admin extensions consume from here — never duplicate hex values, never re-declare spacing scales.

## Install (within the monorepo)

Already wired via the `workspace:*` protocol in any consuming app:

```jsonc
// apps/web/package.json  (or similar)
"dependencies": {
  "@risitex/ui": "workspace:*"
}
```

## Three things consumers wire in

### 1. The Tailwind preset

```ts
// apps/web/tailwind.config.ts
import type { Config } from "tailwindcss";
import risitexPreset from "@risitex/ui/tailwind/preset";

export default {
  presets: [risitexPreset],
  content: ["./src/**/*.{ts,tsx,html,mdx}"],
} satisfies Config;
```

The preset replaces Tailwind's defaults for `spacing`, `borderRadius`, `boxShadow`, `transitionDuration`, `transitionTimingFunction`, `screens`, and `container`. It extends `colors` with both **primitive scales** (`ink`, `paper`, `indigo`, `sage`, `ochre`, `madder`, `slate-cool`) and **semantic groups** (`surface`, `text`, `border`, `action`, `feedback`, `brand`) that resolve through CSS variables — so the same `bg-surface-raised` flips between light and dark automatically.

### 2. The stylesheet

Import once at the app root:

```ts
// apps/web/src/app/layout.tsx
import "@risitex/ui/styles.css";
```

This installs the CSS custom-property layer for both modes (light by default, dark via `prefers-color-scheme` *or* explicit `<html data-theme="dark">`), the reset, OpenType numerics, and the shimmer keyframe.

### 3. The tokens (TypeScript, optional)

Use these when you need a hex value in code — e.g., Framer Motion color animations, canvas, OpenGraph image generation:

```ts
import { indigo, lightTokens, duration, ease, spring } from "@risitex/ui";

// Mode-fixed primitive
const accent = indigo[600];                              // "#2A3F7A"

// Semantic, resolved for a given mode
const cardBg = lightTokens.surface.raised;               // "#FFFFFF"

// Motion presets for Framer Motion
const fadeIn = { duration: 0.14, ease: [0.2, 0, 0, 1] }; // or: duration.fast + ease.standard
```

## What's in the box

| Area | File | Notes |
|---|---|---|
| Color primitives | `src/tokens/colors.ts` | Ink, paper, indigo, sage, ochre, madder, slate-cool — 50→950 scales |
| Spacing | `src/tokens/spacing.ts` | 4-pt base, hairline + half-step exceptions |
| Border radius | `src/tokens/radius.ts` | none/xs/sm/md/lg/xl/2xl/full |
| Elevation | `src/tokens/shadows.ts` | 6 tiers, light + dark variants |
| Motion | `src/tokens/motion.ts` | 5 durations, 4 easings, 2 spring presets |
| Typography | `src/tokens/typography.ts` | 3 families, 14-step type scale |
| Semantic theme | `src/semantic.ts` | Light + dark resolutions |
| CSS variables | `src/styles.css` | Runtime source of truth |
| Tailwind preset | `src/tailwind/preset.ts` | Replaces defaults; extends with semantics + plugins |

## What's NOT yet in the box

- **React component primitives** (Button, Card, Input, MoneyInput, MatrixOrderGrid, …) — Phase 13
- **Iconography** (custom RISITEX additions to Lucide) — Phase 13
- **Storybook / component playground** — Phase 14
- **Print stylesheet** for invoices and quote PDFs — Phase 15

## Rules of engagement

1. **Never hard-code hex.** If a value isn't in `tokens/colors.ts`, add it there first.
2. **Prefer semantic over primitive.** `bg-surface-raised` not `bg-paper-0`. Primitives are escape hatches for mode-fixed cases (print, marketing, OG).
3. **Spacing arithmetic is forbidden.** No `space-3.5` or `pt-[14px]`. If the spacing ladder doesn't fit, the design is wrong.
4. **One accent at a time.** A given screen uses `brand-accent` for action OR a `feedback-*` color for state — never both at peak intensity.
5. **Pure black and pure white are reserved.** `#000` for the monogram only. `#FFFFFF` for image plates only.
6. **Motion is opt-in.** No `transition-all`; always specify the property. Honor `prefers-reduced-motion` — `styles.css` collapses to opacity-only automatically.

## Versioning

Pre-1.0. Token shapes may change. Track changes in CHANGELOG once a consumer lands.
