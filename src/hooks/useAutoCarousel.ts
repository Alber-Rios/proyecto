import { prefersReducedMotion } from '../lib/motionPreference.ts';
import { useCallback, useEffect, useState } from 'react';

/**
 * Carrusel con avance automático.
 * - Se pausa con `paused` (p. ej. cursor encima o foco dentro), con la pestaña
 *   oculta y cuando el usuario pidió reducir el movimiento.
 * - `direction` permite animar hacia la izquierda o la derecha.
 */
export function useAutoCarousel(count: number, intervalMs = 4500, paused = false) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const reduceMotion = prefersReducedMotion();

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Si cambia la cantidad de fotos (otro espacio), se vuelve a la primera.
  useEffect(() => {
    setIndex(0);
  }, [count]);

  const go = useCallback(
    (next: number, dir?: 1 | -1) => {
      if (count <= 0) return;
      setIndex((current) => {
        const target = ((next % count) + count) % count;
        setDirection(dir ?? (target >= current ? 1 : -1));
        return target;
      });
    },
    [count]
  );
  const next = useCallback(() => setIndex((i) => (setDirection(1), (i + 1) % Math.max(count, 1))), [count]);
  const prev = useCallback(() => setIndex((i) => (setDirection(-1), (i - 1 + Math.max(count, 1)) % Math.max(count, 1))), [count]);

  const running = count > 1 && !paused && !hidden && !reduceMotion;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(next, intervalMs);
    return () => window.clearInterval(id);
  }, [running, next, intervalMs, index]);

  return { index, direction, go, next, prev, running };
}
