import { getAccessToken } from '../lib/authSession.ts';

// Base del backend (Vercel Functions o server.ts). Vacía = mismo origen.
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL;
  const cleanBase = base && typeof base === 'string' ? base.replace(/\/$/, '') : '';
  return `${cleanBase}${path}`;
}

// Llamada autenticada al backend con el JWT de la sesión de Supabase.
export async function callApi<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
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
