import { describe, expect, it } from 'vitest';
import type { KpiSnapshot, Reservation } from '../types.ts';
import { buildRevenueCsv, isRevenueReservation, monthlyRevenue, revenueRows } from './revenueReport.ts';
import { evaluateKpis } from './kpi.ts';
import { isAtLeast18 } from './ageValidation.ts';

const reservation = (over: Partial<Reservation>): Reservation => ({
  id: 'RES-1',
  spaceId: 'spc_1',
  spaceTitle: 'Sala; Centro',
  spaceAddress: '',
  spaceImage: '',
  spaceCategory: 'oficina',
  tenantId: 't',
  tenantName: 'Ana',
  tenantEmail: 'a@a.cl',
  tenantRut: '1-9',
  ownerId: 'o',
  ownerName: 'Luis',
  startDate: '2026-10-05',
  endDate: '2026-10-05',
  totalDays: 1,
  dailyRateClp: 100000,
  subtotalClp: 100000,
  platformFeeClp: 5000,
  securityDepositClp: 50000,
  totalClp: 155000,
  intendedUse: '',
  status: 'confirmed',
  paymentStatus: 'paid',
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

describe('reporte de ingresos (RF-27 / RF-28)', () => {
  it('solo considera reservas vigentes con pago aprobado', () => {
    expect(isRevenueReservation(reservation({}))).toBe(true);
    expect(isRevenueReservation(reservation({ paymentStatus: 'pending' }))).toBe(false);
    expect(isRevenueReservation(reservation({ status: 'cancelled' }))).toBe(false);
    expect(isRevenueReservation(reservation({ paymentStatus: 'legacy_simulated', status: 'completed' }))).toBe(true);
  });

  it('calcula el neto descontando comisión y descuento', () => {
    const [row] = revenueRows([reservation({ discountClp: 10000 })]);
    expect(row.rent).toBe(90000);
    expect(row.net).toBe(85000);
  });

  it('agrupa por mes', () => {
    const series = monthlyRevenue(
      [reservation({}), reservation({ id: 'RES-2', startDate: '2026-09-10' }), reservation({ id: 'RES-3', startDate: '2025-01-01' })],
      3,
      new Date('2026-10-12T12:00:00Z')
    );
    expect(series.map((m) => m.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(series[1].net).toBe(95000);
    expect(series[2].count).toBe(1);
  });

  it('exporta CSV con separador ; y celdas escapadas', () => {
    const csv = buildRevenueCsv(revenueRows([reservation({})]));
    const [header, line] = csv.split('\r\n');
    expect(header.split(';')).toHaveLength(10);
    expect(line).toContain('"Sala; Centro"');
    expect(line.endsWith(';95000')).toBe(true);
  });
});

describe('semáforo de KPI (Tabla 66)', () => {
  const snapshot: KpiSnapshot = {
    period_days: 30,
    generated_at: '',
    kpi01_occupancy_pct: 40,
    kpi01_prev_occupancy_pct: 30,
    kpi01_variation_pct: 33.3,
    kpi02_confirmation_minutes: 8,
    kpi03_overbooking_count: 0,
    kpi04_conversion_pct: 1,
    kpi04_views: 100,
    kpi04_conversions: 1,
    kpi05_contract_pct: 100,
    kpi05_confirmed: 5,
    kpi06_kyc_review_hours: null,
    kpi07_cancellation_pct: 20,
    kpi07_created: 10,
    kpi08_avg_rating: 3.8,
    kpi08_reviews: 4,
  };

  it('asigna verde, amarillo, rojo o sin datos', () => {
    const lights = Object.fromEntries(evaluateKpis(snapshot).map((k) => [k.id, k.light]));
    expect(lights).toEqual({
      'KPI-01': 'green',
      'KPI-02': 'yellow',
      'KPI-03': 'green',
      'KPI-04': 'red',
      'KPI-05': 'green',
      'KPI-06': 'none',
      'KPI-07': 'red',
      'KPI-08': 'yellow',
    });
  });

  it('marca sobreventa en rojo', () => {
    const kpi = evaluateKpis({ ...snapshot, kpi03_overbooking_count: 2 }).find((k) => k.id === 'KPI-03');
    expect(kpi?.light).toBe('red');
  });
});

describe('validación de mayoría de edad', () => {
  it('exige 18 años cumplidos', () => {
    const today = new Date('2026-10-12T12:00:00Z');
    expect(isAtLeast18('2008-10-12', today)).toBe(true);
    expect(isAtLeast18('2008-10-13', today)).toBe(false);
  });
});
