import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// CORS: la web llama desde el mismo dominio; solo se abre a los orígenes de CORS_ORIGIN
// (lista separada por comas; "*" se ignora). Sin origen permitido no se envía la cabecera.
function applyCors(req: VercelRequest, res: VercelResponse, methods = 'GET,POST,OPTIONS'): void {
  const origin = String(req.headers.origin || '');
  const allowed = (process.env.CORS_ORIGIN || '').split(',').map((x) => x.trim()).filter((x) => x && x !== '*');
  res.setHeader('Vary', 'Origin');
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}


// Estado del servicio. Vercel Cron la llama una vez al día (vercel.json) para que la
// base de datos de Supabase registre actividad y no se pause por inactividad.
async function pingDatabase(): Promise<'ok' | 'error' | 'not_configured'> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return 'not_configured';
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.from('spaces').select('id', { count: 'exact', head: true }).limit(1);
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

// Diagnóstico de la configuración de correos y acceso (sin revelar secretos).
async function authSetup() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let sqlPatch: 'ok' | 'missing' | 'unknown' = 'unknown';
  if (url && service) {
    try {
      const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await admin.rpc('auth_account_status', { p_email: 'diagnostico@spotly.invalid' });
      sqlPatch = error ? 'missing' : 'ok';
    } catch {
      sqlPatch = 'unknown';
    }
  }
  return {
    serviceRoleKey: Boolean(service),
    emailProvider: process.env.RESEND_API_KEY ? 'resend' : 'supabase',
    emailFrom: process.env.RESEND_API_KEY ? (process.env.EMAIL_FROM ? 'configurado' : 'falta EMAIL_FROM (se usa onboarding@resend.dev, que solo envía al dueño de la cuenta Resend)') : 'plantillas y SMTP de Supabase',
    publicAppUrl: process.env.PUBLIC_APP_URL || null,
    sqlPatch,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res, 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const database = await pingDatabase();
  const status = database === 'error' ? 'degraded' : 'ok';
  // El detalle de la configuración (claves presentes, correo, parche SQL) solo se muestra
  // con HEALTH_TOKEN (?token=…) o en desarrollo: no se le dice a cualquiera cómo está armado.
  const token = String(req.query?.token || '');
  const detailed =
    process.env.NODE_ENV !== 'production' && !process.env.VERCEL
      ? true
      : Boolean(process.env.HEALTH_TOKEN) && token === process.env.HEALTH_TOKEN;
  return res.status(database === 'error' ? 503 : 200).json(
    detailed
      ? { status, database, auth: await authSetup(), timestamp: new Date().toISOString() }
      : { status, timestamp: new Date().toISOString() }
  );
}
