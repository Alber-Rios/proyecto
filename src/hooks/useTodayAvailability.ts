import { useEffect, useRef, useState } from 'react';
import { getSpaceOccupancyFromDb, OccupancySlot } from '../lib/dataAccess.ts';
import { onVisibleAgain } from '../lib/realtime.ts';
import type { Space } from '../types.ts';
import { getSpaceAvailableModalities, type ChileNow } from '../utils/formatters.ts';
import { isOpenOnDate, parseOpeningHours, slotHours } from '../utils/schedule.ts';
import { useChileNow } from './useChileNow.ts';

// Ocupación de hoy de cada espacio, para mostrar en las tarjetas del catálogo
// qué horas quedan libres. Se pide solo cuando la tarjeta entra en pantalla y
// se guarda un minuto en memoria para no repetir consultas al volver atrás.

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; slots: OccupancySlot[] }>();
const inflight = new Map<string, Promise<OccupancySlot[]>>();

function loadOccupancy(spaceId: string, force = false): Promise<OccupancySlot[]> {
  const hit = cache.get(spaceId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.slots);
  const pending = inflight.get(spaceId);
  if (pending) return pending;
  const p = getSpaceOccupancyFromDb(spaceId)
    .then((slots) => {
      cache.set(spaceId, { at: Date.now(), slots });
      return slots;
    })
    .finally(() => inflight.delete(spaceId));
  inflight.set(spaceId, p);
  return p;
}

export type HourState = 'free' | 'busy' | 'past';

export interface TodayAvailability {
  /** Aún no se consulta (la tarjeta no ha entrado en pantalla). */
  loading: boolean;
  /** Arriendo por hora: franjas de hoy dentro del horario del espacio. */
  hourly: boolean;
  /** El espacio no abre hoy o ya cerró. */
  closedToday: boolean;
  hours: { hour: number; state: HourState }[];
  /** Hay una franja libre que empieza en esta hora. */
  freeNow: boolean;
  /** Próxima hora libre de hoy (si no está libre ahora). */
  nextFreeHour: number | null;
  /** Arriendo por día o mes: no hay reservas que tomen el día de hoy. */
  freeToday: boolean;
}

export function computeTodayAvailability(
  space: Pick<Space, 'openingHours' | 'rentalModality' | 'enabledModalities' | 'priceUnit' | 'pricePerHour' | 'pricePerDay' | 'pricePerMonth'>,
  slots: OccupancySlot[] | null,
  now: ChileNow
): TodayAvailability {
  const today = now.iso;
  const modalities = getSpaceAvailableModalities(space);
  const hourly = modalities.includes('por_hora');
  const schedule = parseOpeningHours(space.openingHours);
  const openToday = isOpenOnDate(schedule, today);
  const todays = (slots || []).filter((s) => s.startDate <= today && s.endDate >= today);
  const wholeDayTaken = todays.some((s) => s.hourStart == null || s.hourEnd == null);

  const busy = new Set<number>();
  for (const s of todays) {
    if (s.hourStart == null || s.hourEnd == null) continue;
    for (let h = s.hourStart; h < s.hourEnd; h++) busy.add(h);
  }

  const hours = openToday
    ? slotHours(schedule).map((hour) => {
        const past = hour < now.hour || (hour === now.hour && now.minute >= 50);
        const state: HourState = past ? 'past' : wholeDayTaken || busy.has(hour) ? 'busy' : 'free';
        return { hour, state };
      })
    : [];
  const upcoming = hours.filter((h) => h.state !== 'past');
  const current = hours.find((h) => h.hour === now.hour);
  const freeNow = Boolean(current && current.state === 'free');
  const next = upcoming.find((h) => h.state === 'free');

  return {
    loading: slots === null,
    hourly,
    closedToday: !openToday || upcoming.length === 0,
    hours,
    freeNow,
    nextFreeHour: freeNow ? now.hour : next ? next.hour : null,
    freeToday: !wholeDayTaken && busy.size === 0,
  };
}

/** Disponibilidad de hoy; `ref` va en el elemento que, al verse, dispara la consulta. */
export function useTodayAvailability<T extends HTMLElement>(space: Space) {
  const ref = useRef<T | null>(null);
  const now = useChileNow();
  const [slots, setSlots] = useState<OccupancySlot[] | null>(() => {
    const hit = cache.get(space.id);
    return hit && Date.now() - hit.at < TTL_MS ? hit.slots : null;
  });

  useEffect(() => {
    let active = true;
    const el = ref.current;
    const fetchNow = (force = false) =>
      loadOccupancy(space.id, force).then((s) => {
        if (active) setSlots(s);
      });

    let observer: IntersectionObserver | null = null;
    if (el && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            void fetchNow();
            observer?.disconnect();
          }
        },
        { rootMargin: '200px' }
      );
      observer.observe(el);
    } else {
      void fetchNow();
    }
    const stopVisible = onVisibleAgain(() => void fetchNow(true));
    return () => {
      active = false;
      observer?.disconnect();
      stopVisible();
    };
  }, [space.id]);

  return { ref, availability: computeTodayAvailability(space, slots, now) };
}
