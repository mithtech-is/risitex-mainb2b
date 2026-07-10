import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Our design system swaps Tailwind's default font-size scale for custom
 * typography tokens exposed as `text-<name>` utilities (see the typography
 * plugin in tailwind/preset.ts). tailwind-merge doesn't know these are
 * font-size utilities, so out of the box it lumps e.g. `text-body-md` into the
 * SAME conflict group as text-COLOUR utilities like `text-action-primary-text`
 * and, on "last text-* wins", silently drops the colour. That stripped filled
 * buttons of their label colour — the label then inherited the body text
 * colour, rendering dark-on-navy (invisible) in light theme. Registering the
 * custom sizes under the `font-size` group keeps size and colour in separate
 * groups so both survive the merge.
 */
const FONT_SIZE_TOKENS = [
  "display-2xl",
  "display-xl",
  "display-lg",
  "heading-xl",
  "heading-lg",
  "heading-md",
  "heading-sm",
  "body-lg",
  "body-md",
  "body-sm",
  "caption",
  "micro",
  "mono-md",
  "mono-sm",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZE_TOKENS }],
    },
  },
});

/**
 * Merge Tailwind classes safely — clsx handles conditionals, twMerge resolves
 * conflicts (last write wins for the same property).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
