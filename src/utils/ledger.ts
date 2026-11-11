// Cuánto gana cada parte en una reserva. Debe calzar con public.platform_ledger()
// en supabase/reset-and-setup.sql (la base es la fuente oficial para el panel de
// administración; esta función se usa en el panel del anfitrión y en resúmenes).
//
//   Vigente o finalizada (pending, confirmed, completed):
//     Spotly   = cargo al arrendatario (5 %) + comisión del anfitrión − descuento
//     Anfitrión = arriendo − comisión del anfitrión   (solo confirmada o finalizada)
//   Cancelada o rechazada:
//     Spotly   = lo que no se devolvió (p. ej. el cargo si canceló con < 24 h)
//     Anfitrión = 0
import type { Reservation } from '../types.ts';

const PAID = new Set(['paid', 'partially_refunded', 'refunded', 'refund_pending']);

export const isPaidReservation = (r: Pick<Reservation, 'paymentStatus'>) => PAID.has(r.paymentStatus || '');

export interface ReservationLedger {
  /** Lo que se cobró con Webpay. */
  collectedClp: number;
  tenantFeeClp: number;
  ownerCommissionClp: number;
  discountClp: number;
  cancellationFeeClp: number;
  platformRevenueClp: number;
  ownerNetClp: number;
  /** Arriendo bruto del anfitrión (antes de su comisión), solo si se concretó. */
  ownerGrossClp: number;
  /** Ingreso de Spotly aún no ganado (solicitud pagada por aprobar). */
  pending: boolean;
}

export function reservationLedger(r: Reservation): ReservationLedger {
  const zero: ReservationLedger = {
    collectedClp: 0,
    tenantFeeClp: 0,
    ownerCommissionClp: 0,
    discountClp: 0,
    cancellationFeeClp: 0,
    platformRevenueClp: 0,
    ownerNetClp: 0,
    ownerGrossClp: 0,
    pending: false,
  };
  if (!isPaidReservation(r)) return zero;

  const total = Number(r.totalClp) || 0;
  const fee = Number(r.platformFeeClp) || 0;
  const commission = Number(r.ownerCommissionClp) || 0;
  const discount = Number(r.discountClp) || 0;
  const subtotal = Number(r.subtotalClp) || 0;
  const live = r.status === 'pending' || r.status === 'confirmed' || r.status === 'completed';

  if (live) {
    const earned = r.status === 'confirmed' || r.status === 'completed';
    return {
      collectedClp: total,
      tenantFeeClp: fee,
      ownerCommissionClp: commission,
      discountClp: discount,
      cancellationFeeClp: 0,
      platformRevenueClp: fee + commission - discount,
      ownerNetClp: earned ? subtotal - commission : 0,
      ownerGrossClp: earned ? subtotal : 0,
      pending: r.status === 'pending',
    };
  }

  const refund = r.refundAmountClp ?? total;
  const kept = Math.max(total - refund, 0);
  return { ...zero, collectedClp: total, cancellationFeeClp: kept, platformRevenueClp: kept };
}

/** Texto de la comisión del anfitrión: "10 %", "0 % · lanzamiento". */
export function commissionLabel(r: Pick<Reservation, 'ownerCommissionRate' | 'ownerCommissionReason'>): string {
  const pct = `${Math.round((Number(r.ownerCommissionRate) || 0) * 1000) / 10} %`.replace('.', ',');
  if (r.ownerCommissionReason === 'lanzamiento') return `${pct} · lanzamiento`;
  if (r.ownerCommissionReason === 'bienvenida') return `${pct} · bienvenida`;
  return pct;
}
