import { describe, expect, it } from 'vitest';
import { calculateBookingAmounts, calculateDiscount, inclusiveDays, modalityToPriceUnit, monthlyRange, upcomingMonths, addDaysIso } from './pricing.ts';

const space = { pricePerDay: 100000, pricePerHour: 20000, pricePerMonth: 2000000, securityDeposit: 80000 };

describe('inclusiveDays', () => {
  it('cuenta ambos extremos', () => {
    expect(inclusiveDays('2026-10-12', '2026-10-12')).toBe(1);
    expect(inclusiveDays('2026-10-12', '2026-10-14')).toBe(3);
  });
  it('nunca devuelve menos de un día', () => {
    expect(inclusiveDays('2026-10-14', '2026-10-12')).toBe(1);
    expect(inclusiveDays('fecha', 'inválida')).toBe(1);
  });
});

describe('calculateBookingAmounts (RF-15 / CP-09)', () => {
  it('calcula tarifa diaria y comisión del 5 %, sin garantía', () => {
    const r = calculateBookingAmounts({ space, modality: 'por_dia', startDate: '2026-10-12', endDate: '2026-10-13' });
    expect(r.units).toBe(2);
    expect(r.subtotal).toBe(200000);
    expect(r.platformFee).toBe(10000);
    expect(r.deposit).toBe(0);
    expect(r.total).toBe(210000);
    expect(r.priceUnit).toBe('day');
  });

  it('cobra la garantía solo en arriendos mensuales', () => {
    const r = calculateBookingAmounts({ space, modality: 'mensual', startDate: '2026-10-01', endDate: '2026-10-30' });
    expect(r.subtotal).toBe(2000000);
    expect(r.platformFee).toBe(100000);
    expect(r.deposit).toBe(80000);
    expect(r.total).toBe(2180000);
    const hourly = calculateBookingAmounts({ space, modality: 'por_hora', startDate: '2026-10-12', endDate: '2026-10-12', hourStart: 10, hourEnd: 14 });
    expect(hourly.deposit).toBe(0);
    expect(hourly.total).toBe(80000 + 4000);
  });

  it('no cobra garantía mensual si el propietario no la exige', () => {
    const r = calculateBookingAmounts({ space: { ...space, securityDeposit: 0 }, modality: 'mensual', startDate: '2026-10-01', endDate: '2026-10-30' });
    expect(r.deposit).toBe(0);
    expect(r.total).toBe(2100000);
  });

  it('calcula por hora según el rango horario', () => {
    const r = calculateBookingAmounts({
      space,
      modality: 'por_hora',
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      hourStart: 10,
      hourEnd: 14,
    });
    expect(r.units).toBe(4);
    expect(r.subtotal).toBe(80000);
    expect(r.label).toBe('horas');
  });

  it('calcula meses redondeando hacia arriba cada 30 días', () => {
    const r = calculateBookingAmounts({ space, modality: 'mensual', startDate: '2026-10-01', endDate: '2026-11-05' });
    expect(r.units).toBe(2);
    expect(r.subtotal).toBe(4000000);
  });

  it('usa los valores por defecto cuando el espacio no define tarifa ni garantía', () => {
    const bare = { pricePerDay: 50000 };
    const hourly = calculateBookingAmounts({ space: bare, modality: 'por_hora', startDate: '2026-10-12', endDate: '2026-10-12', hourStart: 9, hourEnd: 10 });
    expect(hourly.subtotal).toBe(45000);
    expect(hourly.deposit).toBe(0);
    const daily = calculateBookingAmounts({ space: bare, modality: 'por_dia', startDate: '2026-10-12', endDate: '2026-10-12' });
    expect(daily.deposit).toBe(0);
    const monthly = calculateBookingAmounts({ space: bare, modality: 'mensual', startDate: '2026-10-01', endDate: '2026-10-30' });
    expect(monthly.subtotal).toBe(3800000);
    expect(monthly.label).toBe('mes');
  });

  it('aplica el descuento sin superar el subtotal', () => {
    const r = calculateBookingAmounts({ space, modality: 'por_dia', startDate: '2026-10-12', endDate: '2026-10-12', discountClp: 10000 });
    expect(r.discount).toBe(10000);
    expect(r.total).toBe(100000 + 5000 - 10000);
    const capped = calculateBookingAmounts({ space, modality: 'por_dia', startDate: '2026-10-12', endDate: '2026-10-12', discountClp: 999999 });
    expect(capped.discount).toBe(100000);
  });
});

describe('calculateDiscount (RF-21)', () => {
  it('aplica porcentaje y tope', () => {
    expect(calculateDiscount(200000, 10)).toBe(20000);
    expect(calculateDiscount(200000, 10, 15000)).toBe(15000);
    expect(calculateDiscount(0, 10)).toBe(0);
    expect(calculateDiscount(1000, 150)).toBe(1000);
  });
});

describe('modalityToPriceUnit', () => {
  it('mapea cada modalidad', () => {
    expect(modalityToPriceUnit('por_hora')).toBe('hour');
    expect(modalityToPriceUnit('por_dia')).toBe('day');
    expect(modalityToPriceUnit('mensual')).toBe('month');
  });
});

describe('arriendo mensual', () => {
  it('suma días a una fecha', () => {
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysIso('2026-12-31', 30)).toBe('2027-01-30');
  });

  it('parte hoy si el mes elegido ya comenzó y cubre bloques de 30 días', () => {
    expect(monthlyRange('2026-10', 1, '2026-10-12')).toEqual({ start: '2026-10-12', end: '2026-11-10' });
    expect(monthlyRange('2026-11', 3, '2026-10-12')).toEqual({ start: '2026-11-01', end: '2027-01-29' });
  });

  it('el rango mensual se cobra como N meses', () => {
    const range = monthlyRange('2026-11', 3, '2026-10-12');
    const r = calculateBookingAmounts({ space, modality: 'mensual', startDate: range.start, endDate: range.end });
    expect(r.units).toBe(3);
    expect(r.subtotal).toBe(6000000);
  });

  it('lista los próximos meses cruzando el año', () => {
    expect(upcomingMonths('2026-11-20', 3)).toEqual([
      { key: '2026-11', label: 'Noviembre 2026' },
      { key: '2026-12', label: 'Diciembre 2026' },
      { key: '2027-01', label: 'Enero 2027' },
    ]);
  });
});
