import { RentalModality, Space } from '../types.ts';

/**
 * Utilidades para formateo de moneda CLP y validación de RUT chileno (Módulo 11)
 */

export function formatClp(amount: number): string {
  if (isNaN(amount)) return '$0';
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString('es-CL')}`;
}

export function cleanRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toUpperCase();
}

export function capitalizeInitial(value: string): string {
  let capitalizeNext = true;
  return Array.from(value, (character) => {
    if (/\s|-/.test(character)) {
      capitalizeNext = true;
      return character;
    }

    if (capitalizeNext) {
      capitalizeNext = false;
      return character.toLocaleUpperCase('es-CL');
    }

    return character;
  }).join('');
}

export function formatFullName(firstNames?: string | null, surnames?: string | null, fullName?: string | null): string {
  const fallbackParts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  const first = capitalizeInitial((firstNames || fallbackParts.shift() || '').trim());
  const last = capitalizeInitial((surnames || fallbackParts.join(' ')).trim());
  return [first, last].filter(Boolean).join(' ');
}

export function getNameInitial(value: string): string {
  return capitalizeInitial(value).trimStart().slice(0, 1) || '?';
}

export function formatRut(rawRut: string): string {
  const cleaned = cleanRut(rawRut);
  if (!cleaned) return '';
  if (cleaned.length <= 1) return cleaned;

  const dv = cleaned.slice(-1);
  let body = cleaned.slice(0, -1);

  // Agrega puntos cada 3 dígitos
  let formattedBody = '';
  while (body.length > 3) {
    formattedBody = '.' + body.slice(-3) + formattedBody;
    body = body.slice(0, -3);
  }
  formattedBody = body + formattedBody;

  return `${formattedBody}-${dv}`;
}

export function validateRut(rut: string): boolean {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 8 || cleaned.length > 9) {
    return false;
  }

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1).toUpperCase();

  // Verificación de solo números en el cuerpo
  if (!/^\d+$/.test(body)) {
    return false;
  }

  // Algoritmo Módulo 11
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  let expectedDv = '';

  if (remainder === 11) {
    expectedDv = '0';
  } else if (remainder === 10) {
    expectedDv = 'K';
  } else {
    expectedDv = remainder.toString();
  }

  return dv === expectedDv;
}

export function getSpaceAvailableModalities(space: Pick<Space, 'rentalModality' | 'enabledModalities' | 'priceUnit' | 'pricePerHour' | 'pricePerDay' | 'pricePerMonth'>): RentalModality[] {
  if (space.enabledModalities?.length) {
    return space.enabledModalities;
  }

  if (space.rentalModality && space.rentalModality !== 'abierto') {
    return [space.rentalModality];
  }

  if (space.rentalModality === 'abierto') {
    const available: RentalModality[] = [];
    if (space.pricePerHour && space.pricePerHour > 0) available.push('por_hora');
    if (space.pricePerDay > 0) available.push('por_dia');
    if (space.pricePerMonth && space.pricePerMonth > 0) available.push('mensual');
    if (available.length) return available;
  }

  if (space.priceUnit === 'hour') return ['por_hora'];
  if (space.priceUnit === 'month') return ['mensual'];
  return ['por_dia'];
}

export function formatDateCl(dateStr: string): string {
  try {
    if (!dateStr) return '';
    const trimmed = dateStr.trim();
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T12:00:00`
      : trimmed;
    const d = new Date(normalized);
    return d.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function getSpaceRateInfo(space: {
  enabledModalities?: RentalModality[];
  priceUnit?: 'hour' | 'day' | 'month';
  rentalModality?: 'por_hora' | 'por_dia' | 'mensual' | 'abierto';
  pricePerHour?: number;
  pricePerDay: number;
  pricePerMonth?: number;
}): {
  amount: number;
  unit: 'hora' | 'día' | 'mes' | 'flexible';
  unitLabel: string;
  formatted: string;
  isFlexible?: boolean;
} {
  const availableModalities = getSpaceAvailableModalities(space);
  const selectedModality = availableModalities[0];
  const isFlexible = availableModalities.length > 1;

  if (selectedModality === 'por_hora' && space.pricePerHour) {
    return {
      amount: space.pricePerHour,
      unit: isFlexible ? 'flexible' : 'hora',
      unitLabel: isFlexible ? '/ hr • Flexible' : '/ hr',
      formatted: `${formatClp(space.pricePerHour)} / hr`,
      isFlexible,
    };
  }

  if (selectedModality === 'mensual' && (space.pricePerMonth || space.pricePerDay)) {
    const amount = space.pricePerMonth || space.pricePerDay;
    return {
      amount,
      unit: isFlexible ? 'flexible' : 'mes',
      unitLabel: isFlexible ? '/ mes • Flexible' : '/ mes',
      formatted: `${formatClp(amount)} / mes`,
      isFlexible,
    };
  }

  return {
    amount: space.pricePerDay,
    unit: isFlexible ? 'flexible' : 'día',
    unitLabel: isFlexible ? '/ día • Flexible' : '/ día',
    formatted: `${formatClp(space.pricePerDay)} / día`,
    isFlexible,
  };
}

/**
 * Retorna la fecha actual en formato ISO YYYY-MM-DD según zona horaria local
 */
// Fecha y hora oficiales de la plataforma: Chile continental (America/Santiago),
// la misma zona que usa la base de datos (chile_today()). Así un usuario con el
// reloj del equipo en otra zona no ve como disponibles horas que ya pasaron.
const CHILE_TZ = 'America/Santiago';

export interface ChileNow {
  iso: string;
  hour: number;
  minute: number;
}

export function getChileNow(date: Date = new Date()): ChileNow {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CHILE_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    return {
      iso: `${get('year')}-${get('month')}-${get('day')}`,
      hour: Number(get('hour')) % 24,
      minute: Number(get('minute')),
    };
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
}

export function getTodayIso(): string {
  return getChileNow().iso;
}

/**
 * true si la franja que empieza a la hora `hour` del día `dateIso` ya comenzó o
 * pasó (hora de Chile). A las 14:05 las franjas de 09:00 a 14:00 están perdidas.
 */
export function isHourSlotPast(dateIso: string, hour: number, now: ChileNow = getChileNow()): boolean {
  if (dateIso < now.iso) return true;
  if (dateIso > now.iso) return false;
  return hour <= now.hour;
}

/**
 * Retorna una fecha ISO desplazada N días a partir de hoy
 */
export function getOffsetDateIso(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
