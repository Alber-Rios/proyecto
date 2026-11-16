import type { Reservation } from '../types.ts';

/** Hay un pago real que respalda la reserva: se puede mostrar el comprobante. */
export const wasPaid = (r: Reservation) =>
  ['paid', 'refund_pending', 'refunded', 'partially_refunded'].includes(r.paymentStatus || '') || Boolean(r.paidAt);
