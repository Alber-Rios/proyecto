// Horario de atención de un espacio, guardado como texto por el formulario de
// publicación: "Lun-Vie 08:00-20:00", "Sáb-Dom 10:00-18:00",
// "Lun-Dom 00:00-24:00 (24/7)". Se interpreta en horas enteras.

export interface OpeningSchedule {
  /** Días abiertos (0 = domingo … 6 = sábado). */
  days: number[];
  /** Hora de apertura (primera franja que se puede reservar). */
  open: number;
  /** Hora de cierre (la reserva debe terminar a esta hora como máximo). */
  close: number;
  /** "Lunes a viernes" */
  daysLabel: string;
  /** "08:00 a 20:00" */
  hoursLabel: string;
}

const DAY_SETS: { prefix: string; days: number[]; label: string }[] = [
  { prefix: '24/7', days: [0, 1, 2, 3, 4, 5, 6], label: 'Todos los días' },
  { prefix: 'Lun-Vie', days: [1, 2, 3, 4, 5], label: 'Lunes a viernes' },
  { prefix: 'Lun-Sáb', days: [1, 2, 3, 4, 5, 6], label: 'Lunes a sábado' },
  { prefix: 'Lun-Dom', days: [0, 1, 2, 3, 4, 5, 6], label: 'Todos los días' },
  { prefix: 'Sáb-Dom', days: [0, 6], label: 'Fines de semana' },
];

/** Horario por defecto para publicaciones antiguas sin horario informado. */
export const DEFAULT_SCHEDULE: OpeningSchedule = {
  days: [0, 1, 2, 3, 4, 5, 6],
  open: 9,
  close: 21,
  daysLabel: 'Todos los días',
  hoursLabel: '09:00 a 21:00',
};

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function parseOpeningHours(text?: string | null): OpeningSchedule {
  if (!text || !text.trim()) return DEFAULT_SCHEDULE;
  const set = (text.includes('24/7') ? DAY_SETS[0] : DAY_SETS.find((d) => text.includes(d.prefix))) || DAY_SETS[3];
  const m = text.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return { ...DEFAULT_SCHEDULE, days: set.days, daysLabel: set.label };
  // Una apertura a las 08:30 deja como primera franja completa la de las 09:00;
  // un cierre a las 20:30 obliga a terminar a las 20:00.
  const open = Number(m[1]) + (Number(m[2]) > 0 ? 1 : 0);
  const close = Math.min(24, Number(m[3]));
  if (!(close > open)) return { ...DEFAULT_SCHEDULE, days: set.days, daysLabel: set.label };
  return { days: set.days, open, close, daysLabel: set.label, hoursLabel: `${pad(open)} a ${pad(close)}` };
}

/** true si el espacio abre ese día (fecha ISO aaaa-mm-dd). */
export function isOpenOnDate(schedule: OpeningSchedule, iso: string): boolean {
  const day = new Date(`${iso}T12:00:00`).getDay();
  return schedule.days.includes(day);
}

/** Franjas de una hora que se ofrecen: de la apertura a la última hora antes del cierre. */
export function slotHours(schedule: OpeningSchedule): number[] {
  return Array.from({ length: schedule.close - schedule.open }, (_, i) => schedule.open + i);
}

const DAY_NAMES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
export function closedDayName(iso: string): string {
  return DAY_NAMES[new Date(`${iso}T12:00:00`).getDay()];
}
