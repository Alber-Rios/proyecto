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
    timestamp: new Date().toISOString(),
  });
}
