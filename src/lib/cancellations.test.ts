import { describe, expect, it } from 'vitest';
import { cancelledByOf, isHistoryCancellation } from './cancellations.ts';
import type { Reservation } from '../types.ts';

const base = { tenantId: 't1', ownerId: 'o1', status: 'cancelled', paymentStatus: 'refunded' } as Reservation;

describe('historial de canceladas', () => {
  it('deja fuera las anuladas por pago fallido o sin pagar', () => {
    expect(isHistoryCancellation({ ...base, paymentStatus: 'failed' })).toBe(false);
    expect(isHistoryCancellation({ ...base, paymentStatus: 'pending' })).toBe(false);
    expect(isHistoryCancellation({ ...base, status: 'confirmed' })).toBe(false);
    expect(isHistoryCancellation(base)).toBe(true);
  });

  it('sabe quién canceló', () => {
    expect(cancelledByOf({ ...base, cancelledBy: 't1' })).toBe('tenant');
    expect(cancelledByOf({ ...base, cancelledBy: 'o1' })).toBe('owner');
    expect(cancelledByOf({ ...base, cancelledBy: 'adm' })).toBe('admin');
    expect(cancelledByOf({ ...base, cancellationReason: 'Cancelada por el propietario' })).toBe('owner');
    expect(cancelledByOf({ ...base, cancellationReason: 'Cancelada por el arrendatario' })).toBe('tenant');
  });
});
