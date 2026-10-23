import type { Reservation } from '../types.ts';

export type CancelledBy = 'tenant' | 'owner' | 'admin';

/**
 * Una reserva cancelada que sí cuenta para el historial: la cancelaron el
 * arrendatario, el propietario o administración después de pagarla.
 * Se dejan fuera las que se anularon solas porque el pago falló
 * (saldo insuficiente, tarjeta rechazada) o nunca se pagaron.
 */
export const isHistoryCancellation = (r: Reservation): boolean => {
  if (r.status !== 'cancelled') return false;
  if (r.paymentStatus === 'failed' || r.paymentStatus === 'pending') return false;
  return true;
};

/** Quién canceló la reserva. Usa cancelled_by y, si falta, el motivo por defecto. */
export const cancelledByOf = (r: Reservation): CancelledBy => {
  if (r.cancelledBy) {
    if (r.cancelledBy === r.tenantId) return 'tenant';
    if (r.cancelledBy === r.ownerId) return 'owner';
    return 'admin';
  }
  const reason = (r.cancellationReason || '').toLowerCase();
  if (reason.includes('propietario') || reason.includes('anfitri')) return 'owner';
  if (reason.includes('administra')) return 'admin';
  return 'tenant';
};
