// Una solicitud de reserva que el anfitrión no respondió vence cuando llega su
// hora de inicio (misma regla que expire_unanswered_requests() en la base):
// - por hora: al empezar la primera hora pedida (hora de Chile);
// - por día o mensual: al empezar el día de inicio.
// Al vencer, la base la rechaza sola y devuelve el 100 % al arrendatario.
import type { ChileNow } from './formatters.ts';

interface RequestLike {
  status: string;
  startDate: string;
  hourStart?: number | null;
}

/** true si la fecha y hora de inicio de la reserva ya llegaron. */
export function hasRequestStarted(r: RequestLike, now: ChileNow): boolean {
  if (r.startDate < now.iso) return true;
  if (r.startDate > now.iso) return false;
  if (r.hourStart === undefined || r.hourStart === null) return true;
  return r.hourStart <= now.hour;
}

/** Solicitud pendiente cuya hora de inicio ya pasó: ya no se puede aprobar. */
export function isExpiredRequest(r: RequestLike, now: ChileNow): boolean {
  return r.status === 'pending' && hasRequestStarted(r, now);
}

/** Solicitud pendiente que todavía se puede aprobar o rechazar. */
export function isActionableRequest(r: RequestLike, now: ChileNow): boolean {
  return r.status === 'pending' && !hasRequestStarted(r, now);
}

/** Minutos que faltan para que venza la solicitud (0 si ya venció). */
export function minutesUntilExpiry(r: RequestLike, now: ChileNow): number {
  if (hasRequestStarted(r, now)) return 0;
  const [y, m, d] = r.startDate.split('-').map(Number);
  const [ny, nm, nd] = now.iso.split('-').map(Number);
  const dayDiff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ny, nm - 1, nd)) / 86_400_000);
  const startMinutes = dayDiff * 1440 + (r.hourStart ?? 0) * 60;
  const nowMinutes = now.hour * 60 + now.minute;
  return Math.max(0, startMinutes - nowMinutes);
}

/** "Vence en 45 min", "Vence en 3 h 20 min", "Vence en 2 días". */
export function expiryLabel(r: RequestLike, now: ChileNow): string {
  const mins = minutesUntilExpiry(r, now);
  if (mins <= 0) return 'Vencida';
  if (mins < 60) return `Vence en ${mins} min`;
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const rest = mins % 60;
    return rest ? `Vence en ${h} h ${rest} min` : `Vence en ${h} h`;
  }
  const days = Math.floor(mins / 1440);
  return `Vence en ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Vence en menos de 3 horas: se destaca para que el anfitrión responda. */
export function isExpiringSoon(r: RequestLike, now: ChileNow): boolean {
  const mins = minutesUntilExpiry(r, now);
  return mins > 0 && mins < 180;
}
