import type { Reservation } from '../types.ts';
import { getChileNow, type ChileNow } from './formatters.ts';

/**
 * Una reserva se puede valorar cuando terminó: completada, o confirmada con su
 * fecha de término ya alcanzada (misma regla que la política RLS de reviews).
 * En el arriendo por hora de hoy se espera a que pase la hora de término.
 */
export function isReservationFinished(r: Reservation, now: ChileNow = getChileNow()): boolean {
  if (r.status === 'completed') return true;
  if (r.status !== 'confirmed') return false;
  if (r.endDate < now.iso) return true;
  if (r.endDate > now.iso) return false;
  if (r.rentalModality === 'por_hora' && r.hourEnd != null) return r.hourEnd <= now.hour;
  return true;
}
