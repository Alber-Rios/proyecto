// Cálculo de montos de una reserva (RF-15).
// Debe mantenerse idéntico a public.expected_reservation_amounts() en
// supabase/reset-and-setup.sql: la base de datos
// rechaza cualquier reserva cuyos montos no coincidan con esta regla.

import type { PriceUnit, Space } from '../types.ts';

export const PLATFORM_FEE_RATE = 0.05;
export const DEFAULT_HOURLY_PRICE = 45000;
export const DEFAULT_MONTHLY_PRICE = 3800000;
export const DEFAULT_HOURLY_DEPOSIT = 50000;
export const DEFAULT_DEPOSIT = 150000;

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
    units = Math.max(Math.ceil(days / 30), 1);
    basePrice = space.pricePerMonth || DEFAULT_MONTHLY_PRICE;
    label = units === 1 ? 'mes' : 'meses';
  } else {
    units = Math.max(days, 1);
    basePrice = space.pricePerDay;
    label = units === 1 ? 'día' : 'días';
  }

  const subtotal = units * basePrice;
  const platformFee = Math.round(subtotal * PLATFORM_FEE_RATE);
  const deposit =
    space.securityDeposit && space.securityDeposit > 0
      ? space.securityDeposit
      : priceUnit === 'hour'
      ? DEFAULT_HOURLY_DEPOSIT
      : DEFAULT_DEPOSIT;
  const discount = Math.min(Math.max(Math.round(params.discountClp || 0), 0), subtotal);
  const total = subtotal + platformFee + deposit - discount;

  return { units, label, basePrice, subtotal, platformFee, deposit, discount, total, priceUnit };
}

// Descuento porcentual sobre el arriendo, con tope opcional (RF-21).
export function calculateDiscount(subtotal: number, percentOff: number, maxDiscountClp?: number | null): number {
  if (subtotal <= 0 || percentOff <= 0) return 0;
  const raw = Math.round((subtotal * Math.min(percentOff, 100)) / 100);
  return maxDiscountClp && maxDiscountClp > 0 ? Math.min(raw, maxDiscountClp) : raw;
}
