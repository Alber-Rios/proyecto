import type { SpaceBlock } from '../types.ts';

/** true si el bloqueo cubre el día completo `iso`. */
export function blockCoversWholeDay(block: SpaceBlock, iso: string): boolean {
  return block.hourStart == null && iso >= block.startDate && iso <= block.endDate;
}

/** Horas (inicio de franja) bloqueadas en el día `iso`; vacío si no aplica. */
export function blockedHoursOnDay(block: SpaceBlock, iso: string, operatingHours: number[]): number[] {
  if (iso < block.startDate || iso > block.endDate) return [];
  if (block.hourStart == null || block.hourEnd == null) return operatingHours;
  return operatingHours.filter((h) => h >= block.hourStart! && h < block.hourEnd!);
}

/** Bloqueos de un espacio que tocan el día `iso`. */
export function blocksOnDay(blocks: SpaceBlock[], spaceId: string, iso: string): SpaceBlock[] {
  return blocks.filter((b) => b.spaceId === spaceId && iso >= b.startDate && iso <= b.endDate);
}

const fmt = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** Descripción corta para listas: "19/10/2026 · 10:00–14:00", "01/11 al 30/11/2026". */
export function describeBlock(block: SpaceBlock): string {
  const days = block.startDate === block.endDate ? fmt(block.startDate) : `${fmt(block.startDate)} al ${fmt(block.endDate)}`;
  if (block.hourStart != null && block.hourEnd != null) {
    return `${days} · ${String(block.hourStart).padStart(2, '0')}:00–${String(block.hourEnd).padStart(2, '0')}:00`;
  }
  return block.startDate === block.endDate ? `${days} · día completo` : days;
}
