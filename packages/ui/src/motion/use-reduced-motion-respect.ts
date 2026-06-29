"use client";

import { useReducedMotion } from "framer-motion";

/**
 * Re-export of Framer Motion's `useReducedMotion` for ergonomic imports. When
 * the user prefers reduced motion, the orchestrators / variants in this
 * package collapse to opacity-only via CSS (see styles.css). Components that
 * compute custom motion in JS should consult this hook and bypass spring/
 * transform values.
 */
export { useReducedMotion };
