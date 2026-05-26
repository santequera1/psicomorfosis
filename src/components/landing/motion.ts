import type { Variants, Transition } from "framer-motion";

/**
 * Easing premium común a toda la landing — cubic-bezier que da
 * sensación de "decelerar elegantemente". Usado en Linear, Framer
 * y otras webs premium.
 */
export const easeOutExpo: Transition["ease"] = [0.22, 1, 0.36, 1];

/**
 * Variantes reusables. La idea es importar estas en cada sección
 * para que toda la página comparta el mismo lenguaje de motion.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: easeOutExpo },
  },
};

export const fadeUpSubtle: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: easeOutExpo },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 24 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.9, ease: easeOutExpo },
  },
};

/**
 * Stagger genérico para containers. Cada hijo respeta este delay.
 */
export const staggerParent: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

/**
 * Floating loop — translateY entre -8px y 8px, 6s. Para screenshots
 * heroes que deben sentirse vivos sin que el ojo lo registre como
 * animación intencional.
 */
export const floating = {
  y: [-8, 8, -8],
  transition: {
    duration: 6,
    repeat: Infinity,
    ease: "easeInOut" as const,
  },
};
