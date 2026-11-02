import { describe, expect, it } from 'vitest';
import { calculateRefund, hoursUntilStart } from './refundPolicy.ts';

// 12-10-2026 12:00 en Santiago (UTC−3 en horario de verano) = 15:00 UTC.
const now = new Date('2026-10-12T15:00:00Z');
const base = { subtotalClp: 100000, discountClp: 0, securityDepositClp: 50000, platformFeeClp: 5000, totalClp: 155000 };

describe('hoursUntilStart', () => {
  it('usa la hora local de Chile', () => {
    expect(hoursUntilStart('2026-10-13', 12, now)).toBeCloseTo(24, 5);
    expect(hoursUntilStart('2026-10-12', 12, now)).toBeCloseTo(0, 5);
  });
});

describe('calculateRefund (RF-18 / CP-13)', () => {
  it('devuelve todo (arriendo, garantía y comisión) con 48 h o más', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-15', hourStart: 9 }, 'tenant', now);
    expect(r.tier).toBe('full');
    expect(r.refundClp).toBe(155000);
  });

  it('entre 24 y 48 h devuelve 50 % del arriendo, la garantía y la comisión', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-13', hourStart: 18 }, 'tenant', now);
    expect(r.tier).toBe('half');
    expect(r.refundClp).toBe(105000);
  });

  it('justo 24 h antes todavía no se cobra la comisión', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-13', hourStart: 12 }, 'tenant', now);
    expect(r.tier).toBe('half');
    expect(r.refundClp).toBe(105000);
  });

  it('con menos de 24 h devuelve solo la garantía y cobra la comisión', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-12', hourStart: 18 }, 'tenant', now);
    expect(r.tier).toBe('deposit_only');
    expect(r.refundClp).toBe(50000);
  });

  it('descuenta el monto promocional del arriendo reembolsable', () => {
    const r = calculateRefund({ ...base, discountClp: 20000, totalClp: 135000, startDate: '2026-10-20' }, 'tenant', now);
    expect(r.refundClp).toBe(80000 + 50000 + 5000);
  });

  it('si falta la comisión la deduce del total', () => {
    const { platformFeeClp: _omit, ...noFee } = base;
    const r = calculateRefund({ ...noFee, startDate: '2026-10-15', hourStart: 9 }, 'tenant', now);
    expect(r.refundClp).toBe(155000);
  });

  it('reembolsa el total si cancela el propietario o administración', () => {
    expect(calculateRefund({ ...base, startDate: '2026-10-12' }, 'owner', now).refundClp).toBe(155000);
    expect(calculateRefund({ ...base, startDate: '2026-10-12' }, 'admin', now).tier).toBe('total');
  });
});
