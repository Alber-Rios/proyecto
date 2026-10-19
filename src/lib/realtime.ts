// Sincronización en tiempo real con carga mínima.
//
// La base de datos no envía filas completas: cada cambio en una tabla publica un
// aviso diminuto { table, op } por Supabase Realtime Broadcast (canales privados
// protegidos por RLS en realtime.messages). El cliente solo vuelve a consultar la
// tabla afectada, agrupando varios avisos seguidos en una sola consulta. Así los
// datos siempre pasan por las consultas normales (RLS y permisos por columna) y no
// hay sondeos periódicos (polling).
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase.ts';

export type RealtimeTable =
  | 'spaces'
  | 'reservations'
  | 'contracts'
  | 'payments'
  | 'disputes'
  | 'visit_requests'
  | 'profiles'
  | 'space_blocks';

export interface ChangeSignal {
  table: RealtimeTable;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
}

/**
 * Se suscribe a un tema privado (catalog, space:<id>, user:<uuid>, admin).
 * `onReconnect` se llama cuando el canal se recupera tras un corte, para
 * recargar lo que pudo perderse mientras no había conexión.
 */
export function subscribeToChanges(
  topic: string,
  onChange: (signal: ChangeSignal) => void,
  onReconnect?: () => void
): () => void {
  if (!isSupabaseConfigured()) return () => undefined;

  let joinedOnce = false;
  const channel: RealtimeChannel = supabase
    .channel(topic, { config: { private: true } })
    .on('broadcast', { event: 'change' }, ({ payload }) => {
      if (payload && typeof payload.table === 'string') onChange(payload as ChangeSignal);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (joinedOnce) onReconnect?.();
        joinedOnce = true;
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Agrupa llamadas repetidas por clave: si llegan 10 avisos de "reservations" en
 * 400 ms, se hace una sola consulta.
 */
export function createKeyedDebouncer(delayMs = 400) {
  const timers = new Map<string, number>();
  const run = (key: string, fn: () => void) => {
    const prev = timers.get(key);
    if (prev) window.clearTimeout(prev);
    timers.set(
      key,
      window.setTimeout(() => {
        timers.delete(key);
        fn();
      }, delayMs)
    );
  };
  const cancelAll = () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers.clear();
  };
  return { run, cancelAll };
}

/**
 * Llama a `cb` cuando la pestaña vuelve a estar visible después de haber estado
 * oculta al menos `minHiddenMs` (el navegador puede cortar el WebSocket de una
 * pestaña en segundo plano). Evita recargar en cada cambio rápido de pestaña.
 */
export function onVisibleAgain(cb: () => void, minHiddenMs = 30000): () => void {
  if (typeof document === 'undefined') return () => undefined;
  let hiddenAt = 0;
  const handler = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
    } else if (hiddenAt && Date.now() - hiddenAt >= minHiddenMs) {
      hiddenAt = 0;
      cb();
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
