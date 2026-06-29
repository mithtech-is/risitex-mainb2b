/**
 * Elevation system — 6 tiers, light + dark variants.
 *
 * "Premium = softer, never harder." Shadows are ambient + key with low opacity.
 * Dark mode leans on 1px outer rings because drop shadows do not read on dark
 * surfaces.
 *
 * The CSS variable layer resolves the mode; this file is the source of truth.
 */

export const shadowsLight = {
  flat: "none",
  rest: "0 1px 2px rgba(15,15,13,0.04), 0 0 0 1px rgba(15,15,13,0.04)",
  raised:
    "0 4px 12px -2px rgba(15,15,13,0.06), 0 2px 4px -2px rgba(15,15,13,0.04), 0 0 0 1px rgba(15,15,13,0.04)",
  popover:
    "0 12px 32px -8px rgba(15,15,13,0.12), 0 4px 12px -4px rgba(15,15,13,0.06), 0 0 0 1px rgba(15,15,13,0.06)",
  modal:
    "0 24px 64px -16px rgba(15,15,13,0.20), 0 8px 24px -8px rgba(15,15,13,0.10), 0 0 0 1px rgba(15,15,13,0.06)",
  toast:
    "0 16px 40px -12px rgba(15,15,13,0.16), 0 0 0 1px rgba(15,15,13,0.08)",
  insetWell: "inset 0 1px 2px rgba(15,15,13,0.04)",
} as const;

export const shadowsDark = {
  flat: "none",
  rest: "0 0 0 1px rgba(255,255,255,0.06)",
  raised:
    "0 4px 12px -2px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.08)",
  popover:
    "0 12px 32px -8px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.10)",
  modal:
    "0 24px 64px -16px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.10)",
  toast:
    "0 16px 40px -12px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.12)",
  insetWell: "inset 0 1px 2px rgba(0,0,0,0.40)",
} as const;

export type ShadowToken = keyof typeof shadowsLight;
