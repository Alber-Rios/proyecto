// Cabeceras de seguridad de Spotly. Las usan server.ts (desarrollo local y Render)
// y vercel.json (Vercel); una prueba comprueba que ambas coincidan.

/** Orígenes externos que la web necesita. Todo lo demás queda bloqueado por la CSP. */
export function buildCsp(extra: { connect?: string[]; img?: string[]; upgrade?: boolean } = {}): string {
  const supabase = ['https://*.supabase.co', 'wss://*.supabase.co'];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co', 'https://images.unsplash.com', ...(extra.img || [])],
    'connect-src': ["'self'", ...supabase, 'https://images.unsplash.com', ...(extra.connect || [])],
    'media-src': ["'self'", 'blob:'],
    'frame-src': ["'self'", 'blob:', 'https://*.supabase.co'],
    'worker-src': ["'self'", 'blob:'],
    'form-action': ["'self'", 'https://webpay3g.transbank.cl', 'https://webpay3gint.transbank.cl'],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
  const list = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (extra.upgrade !== false) list.push('upgrade-insecure-requests');
  return list.join('; ');
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
};
