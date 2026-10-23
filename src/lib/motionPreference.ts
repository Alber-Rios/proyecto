/**
 * Spotly muestra sus efectos aunque el sistema operativo tenga activado
 * "movimiento reducido" (en Windows se activa al apagar "Efectos de
 * animación" y, sin eso, el sitio se veía sin efectos en el computador).
 * Los efectos del sitio son fundidos, contadores y transiciones cortas.
 * Si en el futuro se quiere volver a respetar esa preferencia, basta con
 * cambiar RESPECT_OS_REDUCED_MOTION a true.
 */
const RESPECT_OS_REDUCED_MOTION = false;

export const prefersReducedMotion = (): boolean =>
  RESPECT_OS_REDUCED_MOTION &&
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Reemplazo de useReducedMotion de motion/react con la política del sitio. */
export const useReducedMotion = (): boolean => prefersReducedMotion();
