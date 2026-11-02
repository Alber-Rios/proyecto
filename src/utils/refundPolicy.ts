// Política de cancelación y reembolso (RF-18).
// Es la misma regla que aplica public.compute_refund() en la base de datos; aquí
// se usa para mostrar al usuario el reembolso estimado antes de confirmar.

export type CancellationActor = 'tenant' | 'owner' | 'admin';

export interface RefundInput {
  startDate: string; // YYYY-MM-DD
  hourStart?: number;
  subtotalClp: number;
  discountClp?: number;
  securityDepositClp: number;
  /** Comisión de servicio Spotly (5 %). Si falta, se deduce del total. */
  platformFeeClp?: number;
  totalClp: number;
}

export interface RefundResult {
  refundClp: number;
  tier: 'full' | 'fee_charged' | 'total';
  hoursBeforeStart: number;
  description: string;
}

// Hora local de Chile expresada como timestamp "sin zona", igual que en la base.
function chileWallClockMs(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

export function hoursUntilStart(startDate: string, hourStart: number | undefined, now: Date = new Date()): number {
  const startMs = Date.parse(`${startDate}T00:00:00Z`) + (hourStart || 0) * 3600000;
  return (startMs - chileWallClockMs(now)) / 3600000;
}

export function calculateRefund(input: RefundInput, actor: CancellationActor, now: Date = new Date()): RefundResult {
  const hours = hoursUntilStart(input.startDate, input.hourStart, now);

  if (actor !== 'tenant') {
    return {
      refundClp: input.totalClp,
      tier: 'total',
      hoursBeforeStart: hours,
      description: 'Cancelación del propietario o de administración: se devuelve el 100 % de lo pagado.',
    };
  }

  const rent = Math.max(input.subtotalClp - (input.discountClp || 0), 0);
  const fee = Math.max(
    input.platformFeeClp ?? input.totalClp - rent - input.securityDepositClp,
    0
  );
  // Con 24 h o más de anticipación se devuelve todo. Con menos de 24 h se
  // devuelve el arriendo y la garantía, y solo se cobra la comisión.
  if (hours >= 24) {
    return {
      refundClp: rent + input.securityDepositClp + fee,
      tier: 'full',
      hoursBeforeStart: hours,
      description: 'Con 24 horas o más de anticipación se devuelve todo lo pagado: arriendo, garantía y comisión.',
    };
  }
  return {
    refundClp: rent + input.securityDepositClp,
    tier: 'fee_charged',
    hoursBeforeStart: hours,
    description: `Con menos de 24 horas de anticipación se devuelve el arriendo y la garantía; se cobra solo la comisión de servicio (${fee.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}).`,
  };
}
