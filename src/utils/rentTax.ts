import type { Reservation } from '../types.ts';

// IVA del arriendo de un inmueble amoblado o equipado (art. 17 DL 825).
// El precio publicado YA incluye el IVA. La base imponible es la renta neta menos
// la proporción (según los días arrendados) del 11 % anual del avalúo fiscal.
//   precio = neto + 0,19 · (neto − rebaja)  →  neto = (precio + 0,19 · rebaja) / 1,19

export const IVA_RATE = 0.19;
export const AVALUO_ANNUAL_RATE = 0.11;

export interface RentTax {
  /** Días equivalentes usados para la proporción del avalúo. */
  days: number;
  rebate: number;
  net: number;
  base: number;
  iva: number;
}

/** Días equivalentes de una reserva: horas/24, meses·30 o días. */
export function rentalDays(r: Pick<Reservation, 'rentalModality' | 'hourStart' | 'hourEnd' | 'durationUnits' | 'totalDays'>): number {
  if (r.rentalModality === 'por_hora' && r.hourStart !== undefined && r.hourEnd !== undefined) {
    return Math.max(r.hourEnd - r.hourStart, 0) / 24;
  }
  if (r.rentalModality === 'mensual') return (r.durationUnits || 1) * 30;
  return r.durationUnits || r.totalDays || 1;
}

export function computeRentTax(priceClp: number, avaluoFiscalClp: number, days: number): RentTax {
  const d = Math.min(Math.max(days, 0), 365);
  const rebate = Math.round((avaluoFiscalClp * AVALUO_ANNUAL_RATE * d) / 365);
  const net = Math.round((priceClp + IVA_RATE * rebate) / (1 + IVA_RATE));
  if (net <= rebate) return { days: d, rebate, net: priceClp, base: 0, iva: 0 }; // la rebaja cubre todo
  return { days: d, rebate, net, base: net - rebate, iva: priceClp - net };
}
