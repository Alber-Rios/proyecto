// Sesión del navegador.
//
// El token largo (refresh token) vive solo en una cookie HttpOnly que maneja
// /api/auth: JavaScript no la puede leer. Aquí se guarda en MEMORIA el token de
// acceso corto (1 hora) y se renueva pidiéndolo al servidor antes de que venza.
// Así, ni localStorage ni sessionStorage contienen credenciales.

export interface SessionUser {
  id: string;
  email?: string | null;
}

export interface ClientSession {
  access_token: string;
  expires_at: number; // segundos (epoch)
  user: SessionUser;
}

type Listener = (session: ClientSession | null) => void;

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '');
const authUrl = (action: string) => `${API_BASE}/api/auth?action=${action}`;

let current: ClientSession | null = null;
let refreshing: Promise<ClientSession | null> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

export class AuthApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** POST a /api/auth con la cabecera anti-CSRF y la cookie de sesión. */
export async function authRequest<T = any>(action: string, body: unknown = {}, withBearer = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Spotly-Request': '1' };
  if (withBearer && current) headers.Authorization = `Bearer ${current.access_token}`;
  let response: Response;
  try {
    response = await fetch(authUrl(action), { method: 'POST', credentials: 'include', headers, body: JSON.stringify(body) });
  } catch {
    throw new AuthApiError('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.', 0);
  }
  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!response.ok || payload.success === false) {
    throw new AuthApiError(payload.message || 'No se pudo completar la solicitud.', response.status, payload.code);
  }
  return payload as T;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!current) return;
  // Se renueva 2 minutos antes de vencer (mínimo 10 s).
  const ms = Math.max(10_000, current.expires_at * 1000 - Date.now() - 120_000);
  timer = setTimeout(() => {
    void refreshSession();
  }, ms);
}

function emit() {
  listeners.forEach((l) => l(current));
}

export function setSession(session: ClientSession | null) {
  const changed = current?.access_token !== session?.access_token || current?.user.id !== session?.user.id;
  current = session;
  schedule();
  if (changed) emit();
}

export function getSession(): ClientSession | null {
  return current;
}

/** Pide un token nuevo usando la cookie HttpOnly. Devuelve null si no hay sesión. */
export function refreshSession(): Promise<ClientSession | null> {
  if (refreshing) return refreshing;
  refreshing = authRequest<{ session: ClientSession | null }>('refresh')
    .then((r) => {
      setSession(r.session || null);
      return current;
    })
    .catch((err) => {
      // Sin conexión: se conserva la sesión actual; si el servidor la rechazó, se cierra.
      if (err instanceof AuthApiError && err.status !== 0) setSession(null);
      return current;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Token de acceso vigente (lo renueva si está por vencer). Lo usa el cliente de Supabase. */
export async function getAccessToken(): Promise<string | null> {
  if (refreshing) await refreshing;
  if (current && current.expires_at * 1000 - Date.now() > 30_000) return current.access_token;
  if (!current) return null;
  const s = await refreshSession();
  return s?.access_token ?? null;
}

export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Al volver a la pestaña después de un rato, se renueva si el token está por vencer. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current && current.expires_at * 1000 - Date.now() < 180_000) {
      void refreshSession();
    }
  });
}

/** Limpia sesiones antiguas que versiones anteriores guardaban en localStorage. */
export function purgeLegacyStoredSessions() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && /^sb-.*-auth-token/.test(key)) localStorage.removeItem(key);
    }
  } catch {
    /* almacenamiento no disponible */
  }
}
