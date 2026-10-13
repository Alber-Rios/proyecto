import { supabase } from '../lib/supabase.ts';

// Base del backend (Vercel Functions o server.ts). Vacía = mismo origen.
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL;
  const cleanBase = base && typeof base === 'string' ? base.replace(/\/$/, '') : '';
  return `${cleanBase}${path}`;
}

export type ServerLoginResult =
  | { kind: 'session'; session: { access_token: string; refresh_token: string } }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable' };

// Inicio de sesión mediante el backend (RNF-04): aplica bloqueo por intentos y
// suspensión de cuentas antes de entregar la sesión. "unavailable" solo cuando el
// backend no está configurado (por ejemplo, desarrollo local sin service role).
export async function loginThroughServer(email: string, password: string): Promise<ServerLoginResult> {
  let response: Response;
  try {
    response = await fetch(apiUrl('/api/auth?action=login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { kind: 'error', message: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.' };
  }

  let payload: any = {};
  try {
    payload = await response.json();
  } catch {
    // Respuesta no JSON (por ejemplo, el backend no está desplegado).
  }

  if (response.status === 503 && payload.code === 'NOT_CONFIGURED') {
    return { kind: 'unavailable' };
  }
  if (response.status === 404 && !payload.message) {
    return { kind: 'unavailable' };
  }
  if (!response.ok || !payload.session) {
    return { kind: 'error', message: payload.message || 'No se pudo iniciar sesión.' };
  }
  return { kind: 'session', session: payload.session };
}

// Llamada autenticada al backend con el JWT de la sesión de Supabase.
export async function callApi<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor de pagos. Revisa tu conexión e inténtalo nuevamente.');
  }

  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('El servidor respondió con un formato inesperado.');
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `Error del servidor (${response.status}).`);
  }
  return payload as T;
}

// Envía el navegador al formulario de Transbank (Webpay Plus o inscripción Oneclick).
export function postToTransbank(url: string, field: 'token_ws' | 'TBK_TOKEN', token: string): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = field;
  input.value = token;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}
