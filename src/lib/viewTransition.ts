import { flushSync } from 'react-dom';

type StartViewTransition = (cb: () => void | Promise<void>) => { finished: Promise<void> };

const getStart = (): StartViewTransition | null => {
  if (typeof document === 'undefined') return null;
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  if (!start) return null;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  return start.bind(document);
};

export const supportsViewTransitions = (): boolean => getStart() !== null;

/**
 * Ejecuta un cambio de pantalla dentro de una View Transition del navegador.
 * `prepare` se espera antes de capturar el estado nuevo (por ejemplo, cargar
 * el código de una página diferida) para que la transición no muestre el
 * indicador de carga. Sin soporte o con movimiento reducido, cambia al tiro.
 */
export function runViewTransition(update: () => void, prepare?: () => Promise<unknown>): void {
  const start = getStart();
  if (!start) {
    update();
    return;
  }
  const ready = prepare ? prepare().catch(() => undefined) : Promise.resolve();
  // Si la preparación tarda demasiado, se cambia sin transición para no bloquear.
  const timeout = new Promise((resolve) => window.setTimeout(resolve, 600));
  void Promise.race([ready, timeout]).then(() => {
    start(() => {
      flushSync(update);
    });
  });
}
