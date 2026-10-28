import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const database = await pingDatabase();
  return res.status(database === 'error' ? 503 : 200).json({
    status: database === 'error' ? 'degraded' : 'ok',
    database,
    auth: await authSetup(),
    timestamp: new Date().toISOString(),
  });
}
