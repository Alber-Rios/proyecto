import { describe, expect, it } from 'vitest';
import { calculateRefund, hoursUntilStart } from './refundPolicy.ts';

// 12-10-2026 12:00 en Santiago (UTC−3 en horario de verano) = 15:00 UTC.
const now = new Date('2026-10-12T15:00:00Z');
const base = { subtotalClp: 100000, discountClp: 0, securityDepositClp: 50000, totalClp: 155000 };

describe('hoursUntilStart', () => {
  it('usa la hora local de Chile', () => {
    expect(hoursUntilStart('2026-10-13', 12, now)).toBeCloseTo(24, 5);
    expect(hoursUntilStart('2026-10-12', 12, now)).toBeCloseTo(0, 5);
  });
});

describe('calculateRefund (RF-18 / CP-13)', () => {
  it('devuelve arriendo y garantía con 48 h o más', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-15', hourStart: 9 }, 'tenant', now);
    expect(r.tier).toBe('full');
    expect(r.refundClp).toBe(150000);
  });

  it('devuelve 50 % del arriendo entre 24 y 48 h', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-13', hourStart: 18 }, 'tenant', now);
    expect(r.tier).toBe('half');
    expect(r.refundClp).toBe(100000);
  });

  it('devuelve solo la garantía con menos de 24 h', () => {
    const r = calculateRefund({ ...base, startDate: '2026-10-12', hourStart: 18 }, 'tenant', now);
    expect(r.tier).toBe('deposit_only');
    expect(r.refundClp).toBe(50000);
  });

  it('descuenta el monto promocional del arriendo reembolsable', () => {
    const r = calculateRefund({ ...base, discountClp: 20000, startDate: '2026-10-20' }, 'tenant', now);
    expect(r.refundClp).toBe(80000 + 50000);
  });

  it('reembolsa el total si cancela el propietario o administración', () => {
    expect(calculateRefund({ ...base, startDate: '2026-10-12' }, 'owner', now).refundClp).toBe(155000);
    expect(calculateRefund({ ...base, startDate: '2026-10-12' }, 'admin', now).tier).toBe('total');
  });
});
