// Cálculo de montos de una reserva (RF-15).
// Debe mantenerse idéntico a public.expected_reservation_amounts() en
// supabase/reset-and-setup.sql: la base de datos
// rechaza cualquier reserva cuyos montos no coincidan con esta regla.

import type { PriceUnit, Space } from '../types.ts';

export const PLATFORM_FEE_RATE = 0.05;
export const DEFAULT_HOURLY_PRICE = 45000;
export const DEFAULT_MONTHLY_PRICE = 3800000;
// El arriendo mensual se cobra en bloques de 30 días corridos.
export const MONTH_BLOCK_DAYS = 30;

export type BookingModality = 'por_hora' | 'por_dia' | 'mensual';

export interface BookingAmounts {
  units: number;
  label: string;
  basePrice: number;
  subtotal: number;
  platformFee: number;
  deposit: number;
  discount: number;
  total: number;
  priceUnit: PriceUnit;
}

export function modalityToPriceUnit(modality: BookingModality): PriceUnit {
  if (modality === 'por_hora') return 'hour';
  if (modality === 'mensual') return 'month';
  return 'day';
}

// Días calendario entre dos fechas ISO (YYYY-MM-DD), ambos inclusive.
export function inclusiveDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  const days = Math.round((end - start) / 86400000) + 1;
  return days > 0 ? days : 1;
}

export function calculateBookingAmounts(params: {
  space: Pick<Space, 'pricePerDay' | 'pricePerHour' | 'pricePerMonth' | 'securityDeposit'>;
  modality: BookingModality;
  startDate: string;
  endDate: string;
  hourStart?: number;
  hourEnd?: number;
  discountClp?: number;
}): BookingAmounts {
  const { space, modality, startDate, endDate, hourStart, hourEnd } = params;
  const priceUnit = modalityToPriceUnit(modality);
  const days = inclusiveDays(startDate, endDate);

  let units: number;
  let basePrice: number;
  let label: string;

  if (priceUnit === 'hour') {
    const hours = hourStart !== undefined && hourEnd !== undefined ? hourEnd - hourStart : 1;
    units = Math.max(hours, 1);
    basePrice = space.pricePerHour || DEFAULT_HOURLY_PRICE;
    label = units === 1 ? 'hora' : 'horas';
  } else if (priceUnit === 'month') {
    units = Math.max(Math.ceil(days / MONTH_BLOCK_DAYS), 1);
    basePrice = space.pricePerMonth || DEFAULT_MONTHLY_PRICE;
    label = units === 1 ? 'mes' : 'meses';
  } else {
    units = Math.max(days, 1);
    basePrice = space.pricePerDay;
    label = units === 1 ? 'día' : 'días';
  }

  const subtotal = units * basePrice;
  const platformFee = Math.round(subtotal * PLATFORM_FEE_RATE);
  // Garantía: solo en arriendos mensuales y solo si el propietario la exige.
  const deposit = priceUnit === 'month' ? depositFor(space) : 0;
  const discount = Math.min(Math.max(Math.round(params.discountClp || 0), 0), subtotal);
  const total = subtotal + platformFee + deposit - discount;

  return { units, label, basePrice, subtotal, platformFee, deposit, discount, total, priceUnit };
}

// Garantía mensual definida por el propietario (0 = no exige garantía).
export function depositFor(space: Pick<Space, 'securityDeposit'>): number {
  const value = Math.round(Number(space.securityDeposit) || 0);
  return value > 0 ? value : 0;
}

// Suma días a una fecha ISO (YYYY-MM-DD).
export function addDaysIso(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Período de un arriendo mensual: desde el día 1 del mes elegido (o desde hoy si
// es el mes en curso) por N bloques de 30 días.
export function monthlyRange(monthKey: string, months: number, todayIso: string): { start: string; end: string } {
  const firstDay = `${monthKey}-01`;
  const start = firstDay < todayIso ? todayIso : firstDay;
  const blocks = Math.max(1, Math.round(months) || 1);
  return { start, end: addDaysIso(start, blocks * MONTH_BLOCK_DAYS - 1) };
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Mes en curso y los siguientes, como { key: 'YYYY-MM', label: 'Octubre 2026' }.
export function upcomingMonths(todayIso: string, count: number): { key: string; label: string }[] {
  let year = Number(todayIso.slice(0, 4));
  let month = Number(todayIso.slice(5, 7));
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ key: `${year}-${String(month).padStart(2, '0')}`, label: `${MONTH_NAMES[month - 1]} ${year}` });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

// Descuento porcentual sobre el arriendo, con tope opcional (RF-21).
export function calculateDiscount(subtotal: number, percentOff: number, maxDiscountClp?: number | null): number {
  if (subtotal <= 0 || percentOff <= 0) return 0;
  const raw = Math.round((subtotal * Math.min(percentOff, 100)) / 100);
  return maxDiscountClp && maxDiscountClp > 0 ? Math.min(raw, maxDiscountClp) : raw;
}
