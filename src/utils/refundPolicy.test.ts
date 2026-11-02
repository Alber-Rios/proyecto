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
  it('con 48 h o más devuelve todo', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-15', hourStart: 9 }, 'tenant', now);
    expect(r.tier).toBe('full');
    expect(r.refundClp).toBe(155000);
  });

  it('entre 24 y 48 h también devuelve todo (no se cobra nada)', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-13', hourStart: 18 }, 'tenant', now);
    expect(r.tier).toBe('full');
    expect(r.refundClp).toBe(155000);
  });

  it('justo 24 h antes todavía devuelve todo', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-13', hourStart: 12 }, 'tenant', now);
    expect(r.refundClp).toBe(155000);
  });

  it('con menos de 24 h devuelve arriendo y garantía y cobra solo la comisión', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-12', hourStart: 18 }, 'tenant', now);
    expect(r.tier).toBe('fee_charged');
    expect(r.refundClp).toBe(150000);
  });

  it('con descuento devuelve lo efectivamente pagado', () => {
    const withDiscount = { ...base, discountClp: 20000, totalClp: 135000 };
    expect(calculateRefund({ ...withDiscount, startDate: '2026-10-20' }, 'tenant', now).refundClp).toBe(135000);
    expect(calculateRefund({ ...withDiscount, startDate: '2026-10-12', hourStart: 18 }, 'tenant', now).refundClp).toBe(130000);
  });

  it('si falta la comisión la deduce del total', () => {
    const { platformFeeClp: _omit, ...noFee } = base;
    const r = calculateRefund({ ...noFee, startDate: '2026-10-12', hourStart: 18 }, 'tenant', now);
    expect(r.refundClp).toBe(150000);
  });

  it('reembolsa el total si cancela el propietario o administración', () => {
    expect(calculateRefund({ ...base, startDate: '2026-10-12' }, 'owner', now).refundClp).toBe(155000);
    expect(calculateRefund({ ...base, startDate: '2026-10-12' }, 'admin', now).tier).toBe('total');
  });
});
