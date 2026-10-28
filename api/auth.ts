// Autenticación de Spotly controlada por el servidor (RNF-04, RF-32, RF-33).
//
//   POST /api/auth?action=login     { email, password, remember }  → inicia sesión
//   POST /api/auth?action=refresh                                   → renueva la sesión con la cookie
//   POST /api/auth?action=logout                                    → cierra la sesión y borra la cookie
//   POST /api/auth?action=signup    { email, password, ...datos }   → crea la cuenta SIN activarla y envía un código
//   POST /api/auth?action=verify    { email, code }                 → valida el código y abre la sesión
//   POST /api/auth?action=resend    { email }                       → reenvía el código
//   POST /api/auth?action=forgot    { email }                       → envía el enlace para restablecer la contraseña
//   POST /api/auth?action=reset     { token_hash | access_token, password } → guarda la nueva contraseña
//
// Seguridad:
// · Las contraseñas las guarda Supabase Auth solo como hash bcrypt (con sal); no se pueden revertir.
// · La sesión larga (refresh token) vive en una cookie HttpOnly + Secure + SameSite=Strict
//   limitada a /api/auth: JavaScript no la puede leer, así que un script inyectado no puede robarla.
//   El navegador solo recibe el token de acceso corto (1 hora), que se guarda en memoria.
// · Bloqueo por intentos fallidos (correo + IP y límite global por IP) para login, códigos y recuperación.
// · Respuestas genéricas en "forgot" y "resend" para no revelar qué correos existen.
// · Todas las acciones exigen la cabecera X-Spotly-Request y un Origin del mismo sitio (anti-CSRF).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

// IMPORTANTE: este archivo no importa otros archivos locales. Vercel compila cada
// función por separado y una importación de un .ts local falla al ejecutarse
// ("Cannot find module"), lo que dejaba sin inicio de sesión. Por eso la política de
// contraseñas (copia de src/utils/passwordPolicy.ts, verificada por una prueba) y
// los correos viven aquí mismo.

// ---------- Política de contraseñas (igual a src/utils/passwordPolicy.ts) ----------
const PASSWORD_MIN = 8;
// bcrypt solo considera los primeros 72 bytes; más largo daría una falsa sensación de seguridad.
const PASSWORD_MAX = 72;

interface PasswordCheck {
  id: 'length' | 'lower' | 'upper' | 'digit' | 'personal' | 'common';
  label: string;
  ok: boolean;
}

const COMMON = new Set([
  'password', 'password1', 'contraseña', 'contrasena', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyui', 'abc12345', 'abcd1234', 'spotly123', 'spotly2026', 'iloveyou', 'admin123',
  'chile123', 'chile2026', 'aaaaaaaa', '11111111', '00000000', 'passw0rd', 'Password1',
]);

function checkPassword(password: string, personal: { email?: string; names?: string[]; rut?: string } = {}): PasswordCheck[] {
  const p = password || '';
  const lower = p.toLowerCase();
  const pieces = [
    (personal.email || '').split('@')[0],
    ...(personal.names || []).flatMap((n) => n.split(/\s+/)),
    (personal.rut || '').replace(/[^0-9kK]/g, '').slice(0, -1),
  ]
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length >= 4);
  return [
    { id: 'length', label: `Entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`, ok: p.length >= PASSWORD_MIN && new TextEncoder().encode(p).length <= PASSWORD_MAX },
    { id: 'lower', label: 'Una letra minúscula', ok: /[a-zñáéíóú]/.test(p) },
    { id: 'upper', label: 'Una letra mayúscula', ok: /[A-ZÑÁÉÍÓÚ]/.test(p) },
    { id: 'digit', label: 'Un número', ok: /\d/.test(p) },
    { id: 'personal', label: 'No incluye tu nombre, correo ni RUT', ok: !pieces.some((x) => lower.includes(x)) },
    { id: 'common', label: 'No es una contraseña común', ok: !COMMON.has(lower) && !COMMON.has(p) },
  ];
}

function passwordProblem(password: string, personal?: Parameters<typeof checkPassword>[1]): string | null {
  const failed = checkPassword(password, personal).find((c) => !c.ok);
  return failed ? `La contraseña debe cumplir: ${failed.label.toLowerCase()}.` : null;
}

/** 0 a 4, para la barra de seguridad del formulario. */

// ---------- Correos transaccionales (Resend) ----------
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const emailSenderConfigured = () => Boolean(process.env.RESEND_API_KEY);

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4">
<tr><td style="padding:28px 32px 8px;font-size:26px;font-weight:700;letter-spacing:-1px;color:#0f172a">sp<span style="color:#e11d48">&#9673;</span>tly</td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="padding:18px 32px;background:#fafaf9;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c;line-height:1.5">
Recibiste este correo porque alguien usó esta dirección en Spotly. Si no fuiste tú, puedes ignorarlo: nadie podrá entrar a tu cuenta sin este mensaje.<br>Spotly nunca te pedirá tu contraseña por correo.
</td></tr></table></td></tr></table></body></html>`;
}

function verificationEmail(name: string, code: string, minutes: number) {
  const digits = code.split('').map((d) => `<span style="display:inline-block;min-width:34px;padding:10px 0;margin:0 3px;border-radius:10px;background:#fff1f2;border:1px solid #fecdd3;font-size:26px;font-weight:700;color:#be123c;text-align:center">${escapeHtml(d)}</span>`).join('');
  const html = layout('Tu código de verificación de Spotly', `
<h1 style="margin:0 0 8px;font-size:21px">Confirma tu correo</h1>
<p style="margin:0 0 20px">Hola${name ? ` ${escapeHtml(name)}` : ''}, escribe este código en Spotly para terminar de crear tu cuenta:</p>
<p style="margin:0 0 20px;text-align:center;white-space:nowrap">${digits}</p>
<p style="margin:0;color:#57534e;font-size:13px">El código vence en ${minutes} minutos y solo se puede usar una vez.</p>`);
  const text = `Tu código de verificación de Spotly es ${code}. Vence en ${minutes} minutos. Si no fuiste tú, ignora este correo.`;
  return { subject: `${code} es tu código de verificación de Spotly`, html, text };
}

function resetEmail(link: string, minutes: number) {
  const safe = escapeHtml(link);
  const html = layout('Restablece tu contraseña de Spotly', `
<h1 style="margin:0 0 8px;font-size:21px">Restablece tu contraseña</h1>
<p style="margin:0 0 22px">Recibimos una solicitud para cambiar la contraseña de tu cuenta. Presiona el botón para elegir una nueva:</p>
<p style="margin:0 0 22px;text-align:center"><a href="${safe}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:12px">Crear nueva contraseña</a></p>
<p style="margin:0 0 6px;color:#57534e;font-size:13px">El enlace vence en ${minutes} minutos y solo funciona una vez. Si el botón no abre, copia esta dirección en tu navegador:</p>
<p style="margin:0;word-break:break-all;font-size:12px;color:#be123c">${safe}</p>`);
  const text = `Para crear una nueva contraseña de Spotly abre este enlace (vence en ${minutes} minutos): ${link}\nSi no lo pediste, ignora este correo.`;
  return { subject: 'Restablece tu contraseña de Spotly', html, text };
}

async function sendEmail(to: string, msg: { subject: string; html: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.EMAIL_FROM || 'Spotly <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!r.ok) {
    console.error('Resend rechazó el correo', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return false;
  }
  return true;
}


const GENERIC_ERROR = 'Credenciales inválidas. Revisa tu correo electrónico o contraseña.';
const REFRESH_COOKIE = 'spotly_rt';
const REMEMBER_COOKIE = 'spotly_rm';
const COOKIE_PATH = '/api/auth';
const REMEMBER_SECONDS = 60 * 60 * 24 * 30; // 30 días
const CODE_MINUTES = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Action = 'login' | 'refresh' | 'logout' | 'signup' | 'verify' | 'resend' | 'forgot' | 'reset';
const ACTIONS: Action[] = ['login', 'refresh', 'logout', 'signup', 'verify', 'resend', 'forgot', 'reset'];

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

// ---------- Cookies ----------
function readCookie(req: VercelRequest, name: string): string | null {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function cookie(name: string, value: string, maxAge: number | null): string {
  // __Host- no se usa porque exige Path=/; limitar la ruta a /api/auth reduce más la exposición.
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${COOKIE_PATH}`, 'HttpOnly', 'Secure', 'SameSite=Strict', 'Priority=High'];
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

function setSessionCookies(res: VercelResponse, session: Session, remember: boolean) {
  const age = remember ? REMEMBER_SECONDS : null; // null = se borra al cerrar el navegador
  res.setHeader('Set-Cookie', [cookie(REFRESH_COOKIE, session.refresh_token, age), cookie(REMEMBER_COOKIE, remember ? '1' : '0', age)]);
}

function clearSessionCookies(res: VercelResponse) {
  res.setHeader('Set-Cookie', [cookie(REFRESH_COOKIE, '', 0), cookie(REMEMBER_COOKIE, '', 0)]);
}

// Lo único que recibe el navegador: token de acceso corto y datos básicos del usuario.
const publicSession = (s: Session) => ({
  access_token: s.access_token,
  expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
  user: { id: s.user.id, email: s.user.email },
});

// ---------- Anti-CSRF ----------
function sameSiteRequest(req: VercelRequest): boolean {
  if (req.headers['x-spotly-request'] !== '1') return false;
  const origin = String(req.headers.origin || '');
  if (!origin) return true; // algunos navegadores omiten Origin en mismo origen
  try {
    const o = new URL(origin);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const allowed = (process.env.CORS_ORIGIN || '').split(',').map((x) => x.trim()).filter((x) => x && x !== '*');
    return o.host === host || allowed.includes(origin);
  } catch {
    return false;
  }
}

function appUrl(req: VercelRequest): string {
  const configured = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000');
  const proto = String(req.headers['x-forwarded-proto'] || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'));
  return `${proto.split(',')[0]}://${host}`;
}

// ---------- Utilidades de Supabase ----------
interface Ctx {
  req: VercelRequest;
  res: VercelResponse;
  admin: SupabaseClient;
  newAuthClient: () => SupabaseClient;
  ip: string;
  userAgent: string;
}

async function audit(ctx: Ctx, action: string, severity: string, userId: string, details: Record<string, unknown> = {}) {
  await ctx.admin
    .rpc('write_audit', { p_action: action, p_severity: severity, p_user_id: userId, p_details: details, p_ip: ctx.ip, p_user_agent: ctx.userAgent })
    .then(() => undefined, () => undefined);
}

async function isLocked(ctx: Ctx, key: string) {
  const { data } = await ctx.admin.rpc('login_lock_status', { p_email: key, p_ip: ctx.ip });
  return data?.locked ? (data.locked_until as string | null) || '' : null;
}

type AccountStatus = { user_id: string; email_confirmed: boolean; created_at: string };

async function accountStatus(ctx: Ctx, email: string): Promise<AccountStatus | null> {
  const { data, error } = await ctx.admin.rpc('auth_account_status', { p_email: email });
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return row?.user_id ? row : null;
  }
  // Si aún no se ejecutó el parche SQL (falta auth_account_status), se busca la cuenta con
  // la API de administración de Supabase Auth. Así el registro y la recuperación siguen funcionando.
  console.warn('auth_account_status no disponible; se usa la API de administración:', error.message);
  for (let page = 1; page <= 20; page++) {
    const { data: list, error: listError } = await ctx.admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) throw new Error(listError.message);
    const found = (list.users as Array<{ id: string; email?: string; email_confirmed_at?: string | null; confirmed_at?: string | null; created_at: string }>).find((u) => (u.email || '').toLowerCase() === email);
    if (found) return { user_id: found.id, email_confirmed: isConfirmedUser(found), created_at: found.created_at };
    if (list.users.length < 200) break;
  }
  return null;
}

const isConfirmedUser = (u: { email_confirmed_at?: string | null; confirmed_at?: string | null }) =>
  Boolean(u.email_confirmed_at || u.confirmed_at);

// Envía (o reenvía) el código de verificación. Con Resend el correo lo arma Spotly;
// sin Resend lo envía Supabase con la plantilla "Confirm signup" (que debe incluir {{ .Token }}).
async function sendVerificationCode(ctx: Ctx, email: string, name: string, signup?: { password: string; data: Record<string, unknown> }) {
  if (emailSenderConfigured()) {
    const { data, error } = signup
      ? await ctx.admin.auth.admin.generateLink({ type: 'signup', email, password: signup.password, options: { data: signup.data } })
      : await ctx.admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !data?.properties?.email_otp) throw new Error(error?.message || 'No se pudo generar el código.');
    const ok = await sendEmail(email, verificationEmail(name, data.properties.email_otp, CODE_MINUTES));
    if (!ok) throw new Error('No se pudo enviar el correo de verificación.');
    return;
  }
  const authClient = ctx.newAuthClient();
  if (signup) {
    const { data, error } = await authClient.auth.signUp({ email, password: signup.password, options: { data: signup.data, emailRedirectTo: `${appUrl(ctx.req)}/verificar-correo` } });
    if (error) throw new Error(error.message);
    // Si el proyecto tiene desactivada la confirmación de correo, Supabase activa la cuenta
    // al instante: se cierra esa sesión para que nadie entre sin validar el correo.
    if (data.session) await authClient.auth.signOut().catch(() => undefined);
    return;
  }
  const { error } = await authClient.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${appUrl(ctx.req)}/verificar-correo` } });
  if (error) throw new Error(error.message);
}

// ---------- Acciones ----------
async function login(ctx: Ctx) {
  const { req, res, admin, ip } = ctx;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const remember = req.body?.remember !== false;
  if (!email || !password) return res.status(400).json({ success: false, message: GENERIC_ERROR });

  const locked = await isLocked(ctx, email);
  if (locked !== null) return res.status(429).json({ success: false, message: lockedMessage(locked) });

  const authClient = ctx.newAuthClient();
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    if (error?.message.toLowerCase().includes('email not confirmed')) {
      return res.status(403).json({ success: false, code: 'EMAIL_NOT_CONFIRMED', message: 'Tu correo aún no está verificado. Ingresa el código que te enviamos.' });
    }
    const { data: attempt } = await admin.rpc('register_failed_login', { p_email: email, p_ip: ip });
    await audit(ctx, 'LOGIN_FAILED', 'warning', 'anonymous', { email });
    if (attempt?.locked) return res.status(429).json({ success: false, message: lockedMessage(attempt.locked_until) });
    return res.status(401).json({ success: false, message: GENERIC_ERROR });
  }

  // Aunque el proyecto tenga desactivada la confirmación, Spotly exige el correo verificado.
  if (!isConfirmedUser(data.user)) {
    await authClient.auth.signOut().catch(() => undefined);
    return res.status(403).json({ success: false, code: 'EMAIL_NOT_CONFIRMED', message: 'Tu correo aún no está verificado. Ingresa el código que te enviamos.' });
  }

  const { data: profile } = await admin.from('profiles').select('is_suspended, suspended_reason').eq('id', data.user.id).maybeSingle();
  if (profile?.is_suspended) {
    await admin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
    await audit(ctx, 'LOGIN_BLOCKED_SUSPENDED', 'security', data.user.id);
    return res.status(403).json({
      success: false,
      message: `Tu cuenta está suspendida por administración${profile.suspended_reason ? ` (motivo: ${profile.suspended_reason})` : ''}. Escríbenos desde Ayuda y soporte.`,
    });
  }

  await admin.rpc('reset_login_attempts', { p_email: email, p_ip: ip });
  await audit(ctx, 'USER_LOGGED_IN', 'security', data.user.id, { method: 'password', remember });
  setSessionCookies(res, data.session, remember);
  return res.status(200).json({ success: true, session: publicSession(data.session) });
}

async function refresh(ctx: Ctx) {
  const { req, res } = ctx;
  const token = readCookie(req, REFRESH_COOKIE);
  if (!token) return res.status(200).json({ success: true, session: null });
  const remember = readCookie(req, REMEMBER_COOKIE) === '1';
  const { data, error } = await ctx.newAuthClient().auth.refreshSession({ refresh_token: token });
  if (error || !data.session || !data.user) {
    clearSessionCookies(res);
    return res.status(200).json({ success: true, session: null });
  }
  const { data: profile } = await ctx.admin.from('profiles').select('is_suspended').eq('id', data.user.id).maybeSingle();
  if (profile?.is_suspended) {
    await ctx.admin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
    clearSessionCookies(res);
    return res.status(200).json({ success: true, session: null });
  }
  setSessionCookies(res, data.session, remember);
  return res.status(200).json({ success: true, session: publicSession(data.session) });
}

async function logout(ctx: Ctx) {
  const { req, res, admin } = ctx;
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = readCookie(req, REFRESH_COOKIE);
  let accessToken = bearer;
  if (!accessToken && token) {
    const { data } = await ctx.newAuthClient().auth.refreshSession({ refresh_token: token });
    accessToken = data.session?.access_token || '';
  }
  if (accessToken) {
    const { data: u } = await admin.auth.getUser(accessToken);
    if (u?.user) await audit(ctx, 'USER_LOGGED_OUT', 'info', u.user.id);
    // Revoca el refresh token en Supabase: la cookie deja de servir aunque alguien la copie.
    await admin.auth.admin.signOut(accessToken, 'local').catch(() => undefined);
  }
  clearSessionCookies(res);
  return res.status(200).json({ success: true });
}

async function signup(ctx: Ctx) {
  const { req, res, admin } = ctx;
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const firstNames = String(b.firstNames || '').trim().slice(0, 120);
  const surnames = String(b.surnames || '').trim().slice(0, 120);
  const rut = String(b.rut || '').trim().slice(0, 15);
  const role = b.role === 'owner' ? 'owner' : 'tenant';

  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ success: false, message: 'Ingresa un correo electrónico válido.' });
  const pwdProblem = passwordProblem(password, { email, names: [firstNames, surnames], rut });
  if (pwdProblem) return res.status(400).json({ success: false, message: pwdProblem });
  if (!firstNames || !surnames || !rut) return res.status(400).json({ success: false, message: 'Completa tus nombres, apellidos y RUT.' });
  if (b.agreedTerms !== true) return res.status(400).json({ success: false, message: 'Debes aceptar los términos y condiciones.' });
  const birth = String(b.birthDate || '');
  const adultLimit = new Date();
  adultLimit.setFullYear(adultLimit.getFullYear() - 18);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || new Date(`${birth}T00:00:00`) > adultLimit) {
    return res.status(400).json({ success: false, message: 'Debes tener 18 años o más para crear una cuenta.' });
  }

  const signupKey = `signup:${email}`;
  const locked = await isLocked(ctx, signupKey);
  if (locked !== null) return res.status(429).json({ success: false, message: 'Demasiados intentos de registro. Espera unos minutos e inténtalo de nuevo.' });

  // Un registro anterior que nunca validó su correo no cuenta como cuenta: se reemplaza.
  const existing = await accountStatus(ctx, email);
  if (existing?.email_confirmed) {
    return res.status(409).json({ success: false, message: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.' });
  }
  if (existing && !existing.email_confirmed) {
    await admin.auth.admin.deleteUser(existing.user_id).catch(() => undefined);
  }

  const { data: availability } = await admin.rpc('check_signup_availability', { p_email: email, p_rut: rut });
  const row = Array.isArray(availability) ? availability[0] : availability;
  if (row?.email_taken) return res.status(409).json({ success: false, message: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.' });
  if (row?.rut_taken) return res.status(409).json({ success: false, message: 'Ya existe una cuenta con este RUT. Si es tuya, inicia sesión o recupera tu contraseña.' });

  const data = {
    full_name: `${firstNames} ${surnames}`.trim(),
    first_names: firstNames,
    surnames,
    rut,
    phone: String(b.phone || '').slice(0, 30),
    role,
    owner_terms_accepted: role === 'owner' && b.agreedTerms === true,
    gender: String(b.gender || 'prefiero_no_decir'),
    birth_date: birth,
  };

  try {
    await sendVerificationCode(ctx, email, firstNames.split(' ')[0], { password, data });
  } catch (err) {
    await admin.rpc('register_failed_login', { p_email: signupKey, p_ip: ctx.ip });
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    console.error('Registro: no se pudo enviar el código', msg);
    if (msg.includes('database error') || msg.includes('duplicate')) {
      return res.status(409).json({ success: false, message: 'El RUT o el correo ya están registrados en Spotly.' });
    }
    if (msg.includes('rate limit')) {
      return res.status(429).json({ success: false, message: 'Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.' });
    }
    return res.status(502).json({ success: false, message: 'No pudimos enviar el correo de verificación. Inténtalo nuevamente en unos minutos.' });
  }

  await audit(ctx, 'SIGNUP_CODE_SENT', 'info', 'anonymous', { email, role });
  return res.status(200).json({ success: true, message: 'Te enviamos un código de verificación a tu correo.' });
}

async function verify(ctx: Ctx) {
  const { req, res, admin, ip } = ctx;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').replace(/\s+/g, '');
  if (!EMAIL_RE.test(email) || !/^[0-9A-Za-z]{6,10}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'Ingresa el código de 6 dígitos que te enviamos.' });
  }
  const key = `otp:${email}`;
  const locked = await isLocked(ctx, key);
  if (locked !== null) return res.status(429).json({ success: false, message: `${lockedMessage(locked)} Pide un código nuevo más tarde.` });

  const authClient = ctx.newAuthClient();
  let result = await authClient.auth.verifyOtp({ email, token: code, type: 'email' });
  if (result.error || !result.data.session) result = await authClient.auth.verifyOtp({ email, token: code, type: 'signup' });
  const session = result.data.session;
  if (result.error || !session) {
    const { data: attempt } = await admin.rpc('register_failed_login', { p_email: key, p_ip: ip });
    if (attempt?.locked) return res.status(429).json({ success: false, message: lockedMessage(attempt.locked_until) });
    const expired = (result.error?.message || '').toLowerCase().includes('expired');
    return res.status(400).json({
      success: false,
      message: expired ? 'El código venció. Pide uno nuevo.' : `Código incorrecto. Te quedan ${attempt?.remaining ?? 'pocos'} intentos.`,
    });
  }
  await admin.rpc('reset_login_attempts', { p_email: key, p_ip: ip });
  await audit(ctx, 'EMAIL_VERIFIED', 'security', session.user.id, {});
  setSessionCookies(res, session, true);
  return res.status(200).json({ success: true, session: publicSession(session) });
}

async function resend(ctx: Ctx) {
  const { req, res, admin, ip } = ctx;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const generic = { success: true, message: 'Si tu cuenta está pendiente de verificación, te enviamos un código nuevo.' };
  if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, message: 'Ingresa un correo electrónico válido.' });
  const key = `resend:${email}`;
  if ((await isLocked(ctx, key)) !== null) return res.status(429).json({ success: false, message: 'Pediste muchos códigos. Espera unos minutos.' });
  // Cada reenvío cuenta: máximo 5 por correo e IP cada 15 minutos.
  await admin.rpc('register_failed_login', { p_email: key, p_ip: ip });
  const status = await accountStatus(ctx, email);
  if (status && !status.email_confirmed) {
    const { data: profile } = await admin.from('profiles').select('first_names').eq('id', status.user_id).maybeSingle();
    await sendVerificationCode(ctx, email, String(profile?.first_names || '').split(' ')[0]).catch((e) => console.error('Reenvío de código:', e));
  }
  return res.status(200).json(generic);
}

async function forgot(ctx: Ctx) {
  const { req, res, admin, ip } = ctx;
  const email = String(req.body?.email || '').trim().toLowerCase();
  // Misma respuesta exista o no la cuenta (no se revela qué correos están registrados).
  const generic = { success: true, message: 'Si el correo está registrado en Spotly, te enviamos un enlace para crear una nueva contraseña. Revisa también tu carpeta de spam.' };
  if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, message: 'Ingresa un correo electrónico válido.' });
  const key = `reset:${email}`;
  if ((await isLocked(ctx, key)) !== null) return res.status(429).json({ success: false, message: 'Pediste muchos enlaces. Espera unos minutos e inténtalo de nuevo.' });
  await admin.rpc('register_failed_login', { p_email: key, p_ip: ip });

  let status: AccountStatus | null = null;
  try {
    status = await accountStatus(ctx, email);
  } catch (err) {
    console.error('Recuperación: no se pudo consultar la cuenta', err);
  }
  // Cuenta inexistente o sin verificar: no se envía nada (respuesta igual, sin revelar nada).
  if (!status?.email_confirmed) {
    console.info(`Recuperación: ${status ? 'cuenta sin verificar' : 'no existe cuenta'}; no se envía correo.`);
    return res.status(200).json(generic);
  }

  const redirect = `${appUrl(req)}/restablecer-contrasena`;
  try {
    if (emailSenderConfigured()) {
      const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: redirect } });
      if (error || !data?.properties?.hashed_token) throw new Error(error?.message || 'Supabase no entregó el enlace de recuperación');
      const link = `${redirect}?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
      const sent = await sendEmail(email, resetEmail(link, 60));
      if (!sent) throw new Error('Resend rechazó el correo (revisa RESEND_API_KEY, EMAIL_FROM y el dominio verificado)');
    } else {
      const { error } = await ctx.newAuthClient().auth.resetPasswordForEmail(email, { redirectTo: redirect });
      if (error) throw new Error(`Supabase no pudo enviar el correo: ${error.message}`);
    }
    await audit(ctx, 'PASSWORD_RESET_REQUESTED', 'security', status.user_id, { provider: emailSenderConfigured() ? 'resend' : 'supabase' });
  } catch (err) {
    // La cuenta existe pero el correo no salió: es un problema de configuración, no del usuario.
    console.error('Recuperación de contraseña: el correo no se envió.', err);
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    return res.status(502).json({
      success: false,
      code: 'EMAIL_NOT_SENT',
      message: msg.includes('rate limit')
        ? 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e inténtalo de nuevo.'
        : 'No pudimos enviar el correo en este momento. Inténtalo más tarde o escríbenos desde Ayuda y soporte.',
    });
  }
  return res.status(200).json(generic);
}

// Lee el payload de un JWT ya validado por Supabase (getUser), para revisar el método de acceso.
function jwtClaims(token: string): Record<string, any> {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

async function reset(ctx: Ctx) {
  const { req, res, admin, ip } = ctx;
  const password = String(req.body?.password || '');
  const tokenHash = String(req.body?.token_hash || '');
  const accessToken = String(req.body?.access_token || '');
  const invalid = () => res.status(400).json({ success: false, code: 'LINK_INVALID', message: 'El enlace no es válido o ya venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?».' });
  if (!tokenHash && !accessToken) return invalid();
  // Se valida la contraseña ANTES de usar el enlace, porque el enlace sirve una sola vez.
  const basicProblem = passwordProblem(password);
  if (basicProblem) return res.status(400).json({ success: false, message: basicProblem });
  if ((await isLocked(ctx, `reset-link:${ip}`)) !== null) return res.status(429).json({ success: false, message: 'Demasiados intentos. Espera unos minutos.' });

  // 1. Comprobar que el enlace es un enlace de recuperación válido.
  let userId = '';
  let userEmail = '';
  let names: string[] = [];
  if (tokenHash) {
    const { data, error } = await ctx.newAuthClient().auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error || !data.user || !data.session) {
      await admin.rpc('register_failed_login', { p_email: `reset-link:${ip}`, p_ip: ip });
      return invalid();
    }
    userId = data.user.id;
    userEmail = data.user.email || '';
    names = [String(data.user.user_metadata?.first_names || ''), String(data.user.user_metadata?.surnames || '')];
    // Se cierran todas las sesiones de la cuenta (incluida la de recuperación):
    // después se entra con la contraseña nueva.
    await admin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
  } else {
    const { data, error } = await admin.auth.getUser(accessToken);
    const amr: Array<{ method?: string }> = jwtClaims(accessToken).amr || [];
    if (error || !data.user || !amr.some((m) => m.method === 'recovery')) {
      await admin.rpc('register_failed_login', { p_email: `reset-link:${ip}`, p_ip: ip });
      return invalid();
    }
    userId = data.user.id;
    userEmail = data.user.email || '';
    names = [String(data.user.user_metadata?.first_names || ''), String(data.user.user_metadata?.surnames || '')];
  }

  // 2. Validar y guardar la nueva contraseña (Supabase la guarda como hash bcrypt).
  const problem = passwordProblem(password, { email: userEmail, names });
  if (problem) return res.status(400).json({ success: false, message: problem });
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
  if (updateError) {
    const msg = updateError.message.toLowerCase();
    return res.status(400).json({
      success: false,
      message: msg.includes('same') ? 'La nueva contraseña debe ser distinta de la anterior.' : msg.includes('weak') || msg.includes('pwned') ? 'Esa contraseña es poco segura o apareció en filtraciones conocidas. Elige otra.' : 'No se pudo guardar la contraseña. Inténtalo nuevamente.',
    });
  }

  // 3. Cerrar todas las sesiones abiertas de la cuenta (por si alguien más tenía acceso).
  if (accessToken) await admin.auth.admin.signOut(accessToken, 'global').catch(() => undefined);
  clearSessionCookies(res);
  await audit(ctx, 'PASSWORD_RESET_COMPLETED', 'security', userId, {});
  return res.status(200).json({ success: true, message: 'Tu contraseña se actualizó. Ya puedes iniciar sesión con la nueva.' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  const corsOrigin = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*' ? process.env.CORS_ORIGIN : '';
  if (corsOrigin && req.headers.origin === corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Spotly-Request');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = String(req.query?.action || '') as Action;
  if (req.method !== 'POST' || !ACTIONS.includes(action)) {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }
  if (!sameSiteRequest(req)) {
    return res.status(403).json({ success: false, message: 'Solicitud no permitida.' });
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

  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const ctx: Ctx = {
    req,
    res,
    admin: createClient(url, serviceKey, options),
    newAuthClient: () => createClient(url, anonKey, options),
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
  };

  try {
    switch (action) {
      case 'login': return await login(ctx);
      case 'refresh': return await refresh(ctx);
      case 'logout': return await logout(ctx);
      case 'signup': return await signup(ctx);
      case 'verify': return await verify(ctx);
      case 'resend': return await resend(ctx);
      case 'forgot': return await forgot(ctx);
      case 'reset': return await reset(ctx);
    }
  } catch (err) {
    console.error(`/api/auth ${action}:`, err);
    return res.status(500).json({ success: false, message: 'Ocurrió un error en el servidor. Inténtalo nuevamente.' });
  }
}
export const __test = { passwordProblem };
