import { lazy, type ComponentType } from 'react';

// Carga diferida a prueba de despliegues: si el navegador tiene abierta una
// versión anterior y su archivo ya no existe (o la red falla), se reintenta una
// vez y, si sigue fallando, se recarga la página para traer la versión nueva.
// Así no queda una página en blanco.

const RELOAD_KEY = 'spotly-chunk-reload';

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|Loading chunk|error loading dynamically|MIME type/i.test(msg);
}

/** Recarga la página una sola vez por sesión de pestaña (evita bucles). */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sin almacenamiento: igual se intenta */
  }
  window.location.reload();
  return true;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      await wait(600);
      try {
        return await factory();
      } catch (err2) {
        if (isChunkLoadError(err2) && reloadOnceForNewVersion()) {
          // Mientras recarga, no se muestra nada roto.
          return await new Promise<{ default: T }>(() => {});
        }
        throw err2 ?? err;
      }
    }
  });
}

/** Precarga un módulo sin bloquear (cuando el navegador está libre). */
export function preload(factory: () => Promise<unknown>) {
  const run = () => void factory().catch(() => {});
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => void);
  if (ric) ric(run, { timeout: 3000 });
  else setTimeout(run, 1200);
}
