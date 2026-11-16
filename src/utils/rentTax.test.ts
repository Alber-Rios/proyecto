import { describe, expect, it } from 'vitest';
import { computeRentTax, rentalDays } from './rentTax.ts';

describe('computeRentTax', () => {
  it('aplica la rebaja del 11 % anual del avalúo y cuadra el total', () => {
    const t = computeRentTax(357000, 120_000_000, 2);
    expect(t.rebate).toBe(72329);
    expect(t.net + t.iva).toBe(357000);
    expect(Math.abs(t.iva - Math.round(t.base * 0.19))).toBeLessThanOrEqual(1);
  });
  it('sin IVA cuando la rebaja supera la renta', () => {
    expect(computeRentTax(50000, 500_000_000, 30).iva).toBe(0);
  });
  it('días equivalentes por modalidad', () => {
    expect(rentalDays({ rentalModality: 'por_hora', hourStart: 9, hourEnd: 15, totalDays: 1 })).toBe(0.25);
    expect(rentalDays({ rentalModality: 'mensual', durationUnits: 2, totalDays: 60 })).toBe(60);
    expect(rentalDays({ rentalModality: 'por_dia', durationUnits: 3, totalDays: 3 })).toBe(3);
  });
});
