// Vigencia del contrato en una frase legible: "lunes, 2 de noviembre de 2026, de 08:00 a 09:00 h (1 hora)".

export function formatLongDate(iso: string, withWeekday = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('es-CL', {
    ...(withWeekday ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function formatContractTerm(input: {
  modality?: 'por_hora' | 'por_dia' | 'mensual' | 'abierto';
  startDate: string;
  endDate: string;
  hourStart?: number;
  hourEnd?: number;
  units?: number;
  month?: string;
}): string {
  const { modality, startDate, endDate, hourStart, hourEnd, units, month } = input;
  if (hourStart !== undefined && hourEnd !== undefined) {
    const length = units ?? Math.max(1, hourEnd - hourStart);
    return `${formatLongDate(startDate)}, de ${hh(hourStart)} a ${hh(hourEnd)} h (${plural(length, 'hora', 'horas')})`;
  }
  if (modality === 'mensual') {
    const length = units ?? 1;
    return month
      ? `${month} (${plural(length, 'mes', 'meses')})`
      : `Desde el ${formatLongDate(startDate)} hasta el ${formatLongDate(endDate)} (${plural(length, 'mes', 'meses')})`;
  }
  if (!endDate || endDate === startDate) {
    return `${formatLongDate(startDate)} (jornada completa)`;
  }
  const days = units ? ` (${plural(units, 'día', 'días')})` : '';
  return `Desde el ${formatLongDate(startDate)} hasta el ${formatLongDate(endDate)}${days}`;
}

/** Recupera el horario de un contrato ya firmado a partir de su cláusula de vigencia. */
export function hoursFromClauses(clauses: string[]): { hourStart: number; hourEnd: number } | null {
  for (const clause of clauses) {
    const match = /entre las (\d{1,2}):00 y las (\d{1,2}):00 horas/.exec(clause);
    if (match) return { hourStart: Number(match[1]), hourEnd: Number(match[2]) };
  }
  return null;
}

/** Recupera el destino declarado de un contrato firmado (cláusula segunda). */
export function intendedUseFromClauses(clauses: string[]): string | undefined {
  for (const clause of clauses) {
    const match = /destinado única y exclusivamente a: "([^"]+)"/.exec(clause);
    if (match) return match[1];
  }
  return undefined;
}
