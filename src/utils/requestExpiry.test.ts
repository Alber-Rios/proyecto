import { describe, expect, it } from 'vitest';
import { expiryLabel, isActionableRequest, isExpiredRequest, minutesUntilExpiry } from './requestExpiry.ts';

const now = { iso: '2026-11-02', hour: 12, minute: 37 };

describe('vencimiento de solicitudes', () => {
  it('una solicitud por hora de hoy a las 08:00 ya venció a las 12:37', () => {
    const r = { status: 'pending', startDate: '2026-11-02', hourStart: 8 };
    expect(isExpiredRequest(r, now)).toBe(true);
    expect(isActionableRequest(r, now)).toBe(false);
    expect(expiryLabel(r, now)).toBe('Vencida');
  });

  it('la hora en curso ya cuenta como vencida (12:00 a las 12:37)', () => {
    expect(isExpiredRequest({ status: 'pending', startDate: '2026-11-02', hourStart: 12 }, now)).toBe(true);
  });

  it('una solicitud de hoy a las 15:00 sigue vigente', () => {
    const r = { status: 'pending', startDate: '2026-11-02', hourStart: 15 };
    expect(isActionableRequest(r, now)).toBe(true);
    expect(minutesUntilExpiry(r, now)).toBe(143);
    expect(expiryLabel(r, now)).toBe('Vence en 2 h 23 min');
  });

  it('una reserva por día vence al empezar su día', () => {
    expect(isExpiredRequest({ status: 'pending', startDate: '2026-11-02' }, now)).toBe(true);
    const tomorrow = { status: 'pending', startDate: '2026-11-03' };
    expect(isActionableRequest(tomorrow, now)).toBe(true);
    expect(expiryLabel(tomorrow, now)).toBe('Vence en 11 h 23 min');
    expect(expiryLabel({ status: 'pending', startDate: '2026-11-06' }, now)).toBe('Vence en 3 días');
  });

  it('las reservas confirmadas nunca se marcan como vencidas', () => {
    expect(isExpiredRequest({ status: 'confirmed', startDate: '2026-11-01', hourStart: 8 }, now)).toBe(false);
  });
});
