import type { Variants } from "framer-motion";
import { t } from "./transitions";

/**
 * Orchestrators — opinionated, composed motion behaviours from §25.
 */

export const storefrontPageEnter: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

/** Dashboard route transitions are instant (skeleton-led). */
export const dashboardPageEnter: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 1 },
};

/**
 * Cart drawer — overlay fade + slideRight; checkout CTA inside the drawer can
 * also reveal with `fadeUp` 80ms after content settles.
 */
export const cartDrawerContent: Variants = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: { ...t.enter, when: "beforeChildren" } },
  exit: { x: "100%", transition: t.exit },
};

export const cartDrawerOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: t.fast },
  exit: { opacity: 0, transition: t.exit },
};

/** Modal with backdrop fade + scale-in content. */
export const modalBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: t.fast },
  exit: { opacity: 0, transition: t.exit },
};

export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: t.base },
  exit: { opacity: 0, scale: 0.98, transition: t.exit },
};
