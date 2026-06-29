import type { Config } from "tailwindcss";
import risitexPreset from "@risitex/ui/tailwind/preset";

const config: Config = {
  presets: [risitexPreset],
  content: [
    "./src/**/*.{ts,tsx,mdx,html}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  /*
   * The /tokens reference page builds class names dynamically (e.g.
   * `text-${token}`, `duration-${d}`). Tailwind's static extractor can't see
   * those, so we list them here once. Production code SHOULD NOT rely on this
   * — use static class names everywhere outside the reference page.
   */
  safelist: [
    "text-display-2xl",
    "text-display-xl",
    "text-display-lg",
    "text-heading-xl",
    "text-heading-lg",
    "text-heading-md",
    "text-heading-sm",
    "text-body-lg",
    "text-body-md",
    "text-body-sm",
    "text-caption",
    "text-micro",
    "text-mono-md",
    "text-mono-sm",
    "duration-instant",
    "duration-fast",
    "duration-base",
    "duration-slow",
  ],
};

export default config;
