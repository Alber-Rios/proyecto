// Inicio de sesión controlado por el servidor (RNF-04, RF-32, RF-33).
//
//   POST /api/auth?action=login   { email, password }
//
// Aplica el bloqueo temporal por intentos fallidos (por correo + IP y un límite
// global por IP), rechaza cuentas suspendidas y registra el evento en la
// auditoría con la IP real del cliente. Las funciones de bloqueo de la base solo
// las puede ejecutar este backend (service_role).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const GENERIC_ERROR = 'Credenciales inválidas. Revisa tu correo electrónico o contraseña.';

function clientIp(req: VercelRequest): string {
  const forwarded = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '');
  return forwarded.split(',')[0].trim() || req.socket?.remoteAddress || 'desconocida';
}

function lockedMessage(until?: string | null): string {
  const time = until
    ? new Date(until).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
    : '';
  return `Demasiados intentos fallidos. Por seguridad, el acceso quedó bloqueado temporalmente${
    time ? ` hasta las ${time}` : ''
  }.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' || req.query?.action !== 'login') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceKey || !anonKey) {
    return res.status(503).json({
      success: false,
      code: 'NOT_CONFIGURED',
      message: 'El servidor de autenticación no está configurado (SUPABASE_SERVICE_ROLE_KEY).',
    });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({ success: false, message: GENERIC_ERROR });
  }

  const ip = clientIp(req);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, serviceKey, options);

  try {
    const { data: lock } = await admin.rpc('login_lock_status', { p_email: email, p_ip: ip });
    if (lock?.locked) {
      return res.status(429).json({ success: false, message: lockedMessage(lock.locked_until) });
    }

    const authClient = createClient(url, anonKey, options);
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      if (error?.message.toLowerCase().includes('email not confirmed')) {
        return res.status(401).json({
          success: false,
          message: 'Confirma tu correo electrónico desde el mensaje que te enviamos y luego inicia sesión.',
        });
      }
      const { data: attempt } = await admin.rpc('register_failed_login', { p_email: email, p_ip: ip });
      await admin.rpc('write_audit', {
        p_action: 'LOGIN_FAILED',
        p_severity: 'warning',
        p_user_id: 'anonymous',
        p_details: { email },
        p_ip: ip,
        p_user_agent: userAgent,
      });
      if (attempt?.locked) {
        return res.status(429).json({ success: false, message: lockedMessage(attempt.locked_until) });
      }
      return res.status(401).json({ success: false, message: GENERIC_ERROR });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('is_suspended, suspended_reason')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile?.is_suspended) {
      await authClient.auth.signOut().catch(() => undefined);
      await admin.rpc('write_audit', {
        p_action: 'LOGIN_BLOCKED_SUSPENDED',
        p_severity: 'security',
        p_user_id: data.user.id,
        p_details: {},
        p_ip: ip,
        p_user_agent: userAgent,
      });
      return res.status(403).json({
        success: false,
        message: `Tu cuenta está suspendida por administración${
          profile.suspended_reason ? ` (motivo: ${profile.suspended_reason})` : ''
        }. Escríbenos desde Ayuda y soporte.`,
      });
    }

    await admin.rpc('reset_login_attempts', { p_email: email, p_ip: ip });
    await admin.rpc('write_audit', {
      p_action: 'USER_LOGGED_IN',
      p_severity: 'security',
      p_user_id: data.user.id,
      p_details: { method: 'password' },
      p_ip: ip,
      p_user_agent: userAgent,
    });

    return res.status(200).json({
      success: true,
      session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    });
  } catch {
    return res.status(500).json({ success: false, message: 'No se pudo iniciar sesión. Inténtalo nuevamente.' });
  }
}
