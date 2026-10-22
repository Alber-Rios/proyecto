import { describe, it, expect } from 'vitest';
import { getChileNow, isHourSlotPast } from './formatters.ts';
import { blockCoversWholeDay, blockedHoursOnDay, blocksOnDay, describeBlock } from './spaceBlocks.ts';
import type { SpaceBlock } from '../types.ts';

describe('isHourSlotPast (hora de Chile)', () => {
  const now = { iso: '2026-10-19', hour: 14, minute: 5 };

  it('bloquea las franjas de hoy que ya comenzaron, incluida la hora en curso', () => {
    expect(isHourSlotPast('2026-10-19', 9, now)).toBe(true);
    expect(isHourSlotPast('2026-10-19', 14, now)).toBe(true);
    expect(isHourSlotPast('2026-10-19', 15, now)).toBe(false);
  });

  it('no afecta días futuros y bloquea todo el pasado', () => {
    expect(isHourSlotPast('2026-10-20', 9, now)).toBe(false);
    expect(isHourSlotPast('2026-10-18', 20, now)).toBe(true);
  });

  it('usa la zona America/Santiago y no la del equipo', () => {
    // 2026-10-19 17:30 UTC = 14:30 en Chile continental (UTC-3 en horario de verano)
    const chile = getChileNow(new Date(Date.UTC(2026, 9, 19, 17, 30)));
    expect(chile).toEqual({ iso: '2026-10-19', hour: 14, minute: 30 });
  });
});

describe('bloqueos del propietario', () => {
  const hours = [9, 10, 11, 12, 13, 14];
  const dayBlock: SpaceBlock = { id: 'b1', spaceId: 's1', startDate: '2026-11-01', endDate: '2026-11-30', reason: 'Mes' };
  const hourBlock: SpaceBlock = {
    id: 'b2', spaceId: 's1', startDate: '2026-10-20', endDate: '2026-10-20', hourStart: 10, hourEnd: 13, reason: 'Limpieza',
  };

  it('un bloqueo de mes cubre todos sus días completos', () => {
    expect(blockCoversWholeDay(dayBlock, '2026-11-15')).toBe(true);
    expect(blockCoversWholeDay(dayBlock, '2026-12-01')).toBe(false);
    expect(blockedHoursOnDay(dayBlock, '2026-11-15', hours)).toEqual(hours);
  });

  it('un bloqueo por horas solo ocupa esas franjas y no el día completo', () => {
    expect(blockCoversWholeDay(hourBlock, '2026-10-20')).toBe(false);
    expect(blockedHoursOnDay(hourBlock, '2026-10-20', hours)).toEqual([10, 11, 12]);
    expect(blockedHoursOnDay(hourBlock, '2026-10-21', hours)).toEqual([]);
  });

  it('filtra por espacio y día, y describe el bloqueo', () => {
    expect(blocksOnDay([dayBlock, hourBlock], 's1', '2026-10-20')).toEqual([hourBlock]);
    expect(blocksOnDay([dayBlock], 'otro', '2026-11-02')).toEqual([]);
    expect(describeBlock(hourBlock)).toBe('20/10/2026 · 10:00–13:00');
    expect(describeBlock(dayBlock)).toBe('01/11/2026 al 30/11/2026');
  });
});

import { isReservationFinished } from './reviewEligibility.ts';
import type { Reservation } from '../types.ts';

describe('isReservationFinished (reseñas)', () => {
  const now = { iso: '2026-10-22', hour: 15, minute: 0 };
  const base = { status: 'confirmed', startDate: '2026-10-20', endDate: '2026-10-21' } as Reservation;

  it('permite valorar reservas confirmadas ya terminadas o completadas', () => {
    expect(isReservationFinished(base, now)).toBe(true);
    expect(isReservationFinished({ ...base, status: 'completed', endDate: '2026-10-30' }, now)).toBe(true);
  });

  it('no permite valorar reservas futuras, pendientes ni canceladas', () => {
    expect(isReservationFinished({ ...base, endDate: '2026-10-25' }, now)).toBe(false);
    expect(isReservationFinished({ ...base, status: 'pending' }, now)).toBe(false);
    expect(isReservationFinished({ ...base, status: 'cancelled' }, now)).toBe(false);
  });

  it('en el arriendo por hora de hoy espera a que termine la franja', () => {
    const hourly = { ...base, rentalModality: 'por_hora', endDate: '2026-10-22', hourStart: 13 } as Reservation;
    expect(isReservationFinished({ ...hourly, hourEnd: 15 }, now)).toBe(true);
    expect(isReservationFinished({ ...hourly, hourEnd: 17 }, now)).toBe(false);
  });
});
