import { useEffect, useState } from 'react';
import { getChileNow, ChileNow } from '../utils/formatters.ts';

/**
 * Hora actual de Chile que se actualiza sola cada minuto, para que las franjas
 * que van pasando desaparezcan sin recargar la página.
 */
export function useChileNow(intervalMs = 60000): ChileNow {
  const [now, setNow] = useState<ChileNow>(() => getChileNow());
  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const next = getChileNow();
        return prev.iso === next.iso && prev.hour === next.hour && prev.minute === next.minute ? prev : next;
      });
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}
