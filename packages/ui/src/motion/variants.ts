import type { Variants } from "framer-motion";
import { t } from "./transitions";

/**
 * Named variant library — every motion pattern in the blueprint §25, as a
 * reusable Framer Motion Variants object.
 *
 * Pair with `<motion.div variants={fadeUp} initial="hidden" animate="visible"
 * exit="exit" />`. For lists, wrap in `<motion.div variants={listStagger}
 * initial="hidden" animate="visible" />`.
 */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: t.fast },
  exit: { opacity: 0, transition: t.exit },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: t.springSoft },
  exit: { opacity: 0, y: -4, transition: t.exit },
};

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: t.fast },
  exit: { opacity: 0, y: -4, transition: t.exit },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: t.base },
  exit: { opacity: 0, scale: 0.98, transition: t.exit },
};

export const slideRight: Variants = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: t.enter },
  exit: { x: "100%", transition: t.exit },
};

export const slideLeft: Variants = {
  hidden: { x: "-100%" },
  visible: { x: 0, transition: t.enter },
  exit: { x: "-100%", transition: t.exit },
};

export const slideUp: Variants = {
  hidden: { y: "100%" },
  visible: { y: 0, transition: t.enter },
  exit: { y: "100%", transition: t.exit },
};

export const lift: Variants = {
  rest: { y: 0 },
  hover: { y: -2, transition: t.instant },
};

export const pressDown: Variants = {
  rest: { scale: 1 },
  tap: { scale: 0.98, transition: t.instant },
};

export const chevronToggle: Variants = {
  closed: { rotate: 0 },
  open: { rotate: 180, transition: t.base },
};

/**
 * List stagger — parent emits its children at 32ms intervals on initial mount
 * only. Cap at 5 staggered children (the rest snap). Re-mount on filter/sort
 * change should NOT stagger; pass `staggerChildren: 0` when re-keying.
 */
export const listStagger: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.032,
      delayChildren: 0,
      staggerDirection: 1,
    },
  },
};

export const listItem: Variants = fadeUp;

export const priceFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: t.fast },
};

export const badgePulse: Variants = {
  rest: { scale: 1 },
  pulse: {
    scale: [1, 1.08, 1],
    transition: { duration: 0.4, ease: "easeOut" },
  },
};
