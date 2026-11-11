import { describe, expect, it } from 'vitest';
import { commissionLabel, reservationLedger } from './ledger.ts';
import type { Reservation } from '../types.ts';

// Mismos casos que se probaron contra public.platform_ledger() en Postgres.
const base = {
  id: 'r',
  subtotalClp: 40000,
  platformFeeClp: 2000,
  securityDepositClp: 0,
  discountClp: 0,
  totalClp: 42000,
  ownerCommissionRate: 0.1,
  ownerCommissionClp: 4000,
  status: 'completed',
  paymentStatus: 'paid',
} as unknown as Reservation;

describe('reservationLedger', () => {
  it('reserva finalizada: Spotly 5 % + 10 %, anfitrión arriendo − comisión', () => {
    const l = reservationLedger(base);
    expect(l.platformRevenueClp).toBe(6000);
    expect(l.ownerNetClp).toBe(36000);
    expect(l.ownerGrossClp).toBe(40000);
  });

  it('el descuento lo absorbe Spotly: el anfitrión recibe lo mismo', () => {
    const l = reservationLedger({ ...base, discountClp: 5000, totalClp: 37000 });
    expect(l.platformRevenueClp).toBe(1000);
    expect(l.ownerNetClp).toBe(36000);
  });

  it('mensual con 5 % y garantía: la garantía no es ganancia de nadie', () => {
    const l = reservationLedger({
      ...base,
      subtotalClp: 800000,
      platformFeeClp: 40000,
      securityDepositClp: 200000,
      totalClp: 1040000,
      ownerCommissionRate: 0.05,
      ownerCommissionClp: 40000,
      paymentStatus: 'refund_pending',
      refundAmountClp: 200000,
    });
    expect(l.platformRevenueClp).toBe(80000);
    expect(l.ownerNetClp).toBe(760000);
  });

  it('cancelada con menos de 24 h: Spotly se queda con el cargo, el anfitrión con nada', () => {
    const l = reservationLedger({ ...base, status: 'cancelled', paymentStatus: 'refund_pending', refundAmountClp: 40000 });
    expect(l.cancellationFeeClp).toBe(2000);
    expect(l.platformRevenueClp).toBe(2000);
    expect(l.ownerNetClp).toBe(0);
  });

  it('cancelada a tiempo o rechazada: nadie gana', () => {
    expect(reservationLedger({ ...base, status: 'rejected', refundAmountClp: 42000 }).platformRevenueClp).toBe(0);
  });

  it('solicitud pagada por aprobar: el ingreso queda marcado como pendiente', () => {
    const l = reservationLedger({ ...base, status: 'pending' });
    expect(l.pending).toBe(true);
    expect(l.ownerNetClp).toBe(0);
  });

  it('sin pago no hay montos', () => {
    expect(reservationLedger({ ...base, paymentStatus: 'pending' }).platformRevenueClp).toBe(0);
  });

  it('etiqueta de comisión', () => {
    expect(commissionLabel({ ownerCommissionRate: 0, ownerCommissionReason: 'lanzamiento' })).toBe('0 % · lanzamiento');
    expect(commissionLabel({ ownerCommissionRate: 0.1, ownerCommissionReason: 'estandar' })).toBe('10 %');
    expect(commissionLabel({ ownerCommissionRate: 0.05, ownerCommissionReason: 'mensual' })).toBe('5 %');
  });
});
