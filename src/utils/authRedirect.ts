// Navegación alrededor del inicio de sesión: a dónde volver y qué rutas son de acceso.

export const AUTH_PATHS = ['/login', '/register', '/forgot-password'];

export const isAuthPath = (path: string) => AUTH_PATHS.includes(path);

/**
 * Ruta a la que se vuelve después de iniciar sesión o registrarse.
 * Solo acepta rutas internas (empiezan con "/") y nunca otra página de acceso,
 * para evitar redirecciones abiertas o bucles.
 */
export function authReturnPath(state: unknown, fallback = '/'): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return fallback;
  const pathOnly = from.split(/[?#]/)[0];
  if (isAuthPath(pathOnly)) return fallback;
  return from;
}
