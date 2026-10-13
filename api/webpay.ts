// Integración Webpay Plus (Transbank) — RF-17, CP-11, CP-12, RF-18.
//
//   POST /api/webpay?action=create   { reservationId }      (JWT del arrendatario)
//   GET|POST /api/webpay?action=return                     (retorno desde Transbank)
//   POST /api/webpay?action=refund   { reservationId }      (JWT de una de las partes)
//
// Las escrituras en pagos y reservas se hacen con la service role key: el cliente
// nunca puede marcar una reserva como pagada por sí mismo.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Credenciales públicas del ambiente de integración publicadas por Transbank.
const INTEGRATION_COMMERCE_CODE = '597055555532';
const INTEGRATION_API_KEY = '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C';
const INTEGRATION_HOST = 'https://webpay3gint.transbank.cl';
const PRODUCTION_HOST = 'https://webpay3g.transbank.cl';
const API_PATH = '/rswebpaytransaction/api/webpay/v1.2/transactions';

type WebpayEnvironment = 'integration' | 'production';

interface WebpayConfig {
  environment: WebpayEnvironment;
  host: string;
  commerceCode: string;
  apiKey: string;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getWebpayConfig(): WebpayConfig {
  const environment: WebpayEnvironment = process.env.WEBPAY_ENV === 'production' ? 'production' : 'integration';
  if (environment === 'production') {
    const commerceCode = process.env.WEBPAY_COMMERCE_CODE;
    const apiKey = process.env.WEBPAY_API_KEY;
    if (!commerceCode || !apiKey) {
      throw new HttpError(503, 'Webpay en producción requiere WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY.');
    }
    return { environment, host: PRODUCTION_HOST, commerceCode, apiKey };
  }
  return {
    environment,
    host: INTEGRATION_HOST,
    commerceCode: process.env.WEBPAY_COMMERCE_CODE || INTEGRATION_COMMERCE_CODE,
    apiKey: process.env.WEBPAY_API_KEY || INTEGRATION_API_KEY,
  };
}

function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new HttpError(
      503,
      'El servidor de pagos no está configurado: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno del backend.'
    );
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function transbank<T>(config: WebpayConfig, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${config.host}${API_PATH}${path}`, {
    method,
    headers: {
      'Tbk-Api-Key-Id': config.commerceCode,
      'Tbk-Api-Key-Secret': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new HttpError(502, `Transbank respondió ${response.status}: ${payload.error_message || text || 'sin detalle'}`);
  }
  return payload as T;
}

function appOrigin(req: VercelRequest): string {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

async function requireUser(req: VercelRequest, admin: SupabaseClient) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Debes iniciar sesión.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesión inválida o expirada.');
  return data.user;
}

function param(req: VercelRequest, name: string): string | undefined {
  const fromQuery = req.query?.[name];
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  const body = req.body;
  if (body && typeof body === 'object' && typeof body[name] === 'string' && body[name]) return body[name];
  if (typeof body === 'string' && body) {
    const value = new URLSearchParams(body).get(name);
    if (value) return value;
  }
  return undefined;
}

function newBuyOrder(): string {
  // Máximo 26 caracteres según Transbank.
  return `SP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase().slice(0, 26);
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const admin = getAdminClient();
  const config = getWebpayConfig();
  const user = await requireUser(req, admin);
  const reservationId = param(req, 'reservationId');
  if (!reservationId) throw new HttpError(400, 'Falta reservationId.');

  const { data: reservation, error } = await admin
    .from('reservations')
    .select('id, tenant_id, total_clp, status, payment_status')
    .eq('id', reservationId)
    .single();
  if (error || !reservation) throw new HttpError(404, 'Reserva no encontrada.');
  if (reservation.tenant_id !== user.id) throw new HttpError(403, 'La reserva no pertenece a tu cuenta.');
  if (reservation.status !== 'pending' || reservation.payment_status !== 'pending') {
    throw new HttpError(409, 'Esta reserva ya no admite pagos (fue pagada, anulada o expiró).');
  }

  const amount = Math.round(Number(reservation.total_clp));
  const buyOrder = newBuyOrder();
  const sessionId = user.id.slice(0, 61);
  const returnUrl = `${appOrigin(req)}/api/webpay?action=return`;

  const created = await transbank<{ token: string; url: string }>(config, 'POST', '', {
    buy_order: buyOrder,
    session_id: sessionId,
    amount,
    return_url: returnUrl,
  });

  const { error: insertError } = await admin.from('payments').insert({
    reservation_id: reservation.id,
    tenant_id: user.id,
    environment: config.environment,
    buy_order: buyOrder,
    session_id: sessionId,
    token: created.token,
    amount_clp: amount,
    status: 'created',
  });
  if (insertError) throw new HttpError(500, `No se pudo registrar el pago: ${insertError.message}`);

  return res.status(200).json({ success: true, url: created.url, token: created.token, environment: config.environment });
}

// ---------------------------------------------------------------------------
// return (commit)
// ---------------------------------------------------------------------------
interface CommitResponse {
  vci?: string;
  amount: number;
  status: string;
  buy_order: string;
  session_id: string;
  card_detail?: { card_number?: string };
  accounting_date?: string;
  transaction_date?: string;
  authorization_code?: string;
  payment_type_code?: string;
  response_code: number;
  installments_number?: number;
}

async function markPaymentFailed(admin: SupabaseClient, payment: any, status: 'failed' | 'aborted', raw: unknown) {
  if (payment.status === 'created') {
    await admin
      .from('payments')
      .update({ status, raw_response: raw, committed_at: new Date().toISOString() })
      .eq('id', payment.id);
  }
  // Libera el bloque horario (CP-12): la reserva no confirmada se anula sin cobro.
  await admin
    .from('reservations')
    .update({
      status: 'cancelled',
      payment_status: 'failed',
      refund_amount_clp: 0,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: status === 'aborted' ? 'Pago anulado por el usuario en Webpay' : 'Pago rechazado por Webpay',
    })
    .eq('id', payment.reservation_id)
    .eq('payment_status', 'pending');
}

async function handleReturn(req: VercelRequest, res: VercelResponse) {
  const origin = appOrigin(req);
  const redirect = (result: string, reservationId?: string) => {
    const query = new URLSearchParams({ pago: result });
    if (reservationId) query.set('reserva', reservationId);
    res.statusCode = 303;
    res.setHeader('Location', `${origin}/my-bookings?${query.toString()}`);
    res.end();
  };

  const admin = getAdminClient();
  const config = getWebpayConfig();
  const tokenWs = param(req, 'token_ws');
  const tbkToken = param(req, 'TBK_TOKEN');
  const tbkOrder = param(req, 'TBK_ORDEN_COMPRA');

  // Flujo anulado por el usuario o timeout del formulario de pago.
  if (!tokenWs || tbkToken) {
    const lookup = tbkToken
      ? admin.from('payments').select('*').eq('token', tbkToken)
      : tbkOrder
      ? admin.from('payments').select('*').eq('buy_order', tbkOrder)
      : null;
    if (!lookup) return redirect('error');
    const { data: payment } = await lookup.maybeSingle();
    if (!payment) return redirect('error');
    await markPaymentFailed(admin, payment, 'aborted', { tbkToken, tbkOrder });
    return redirect('anulado', payment.reservation_id);
  }

  const { data: payment } = await admin.from('payments').select('*').eq('token', tokenWs).maybeSingle();
  if (!payment) return redirect('error');
  if (payment.status === 'authorized') return redirect('exito', payment.reservation_id);
  if (payment.status !== 'created') return redirect('rechazado', payment.reservation_id);

  let commit: CommitResponse;
  try {
    commit = await transbank<CommitResponse>(config, 'PUT', `/${encodeURIComponent(tokenWs)}`);
  } catch {
    // Si el commit ya se había hecho, el estado de la transacción es la fuente de verdad.
    try {
      commit = await transbank<CommitResponse>(config, 'GET', `/${encodeURIComponent(tokenWs)}`);
    } catch {
      await markPaymentFailed(admin, payment, 'failed', { error: 'commit_failed' });
      return redirect('rechazado', payment.reservation_id);
    }
  }

  const approved =
    commit.response_code === 0 &&
    commit.status === 'AUTHORIZED' &&
    Math.round(Number(commit.amount)) === Math.round(Number(payment.amount_clp)) &&
    commit.buy_order === payment.buy_order;

  if (!approved) {
    await admin
      .from('payments')
      .update({
        status: 'failed',
        response_code: commit.response_code,
        raw_response: commit,
        committed_at: new Date().toISOString(),
      })
      .eq('id', payment.id);
    await markPaymentFailed(admin, { ...payment, status: 'failed' }, 'failed', commit);
    return redirect('rechazado', payment.reservation_id);
  }

  const nowIso = new Date().toISOString();
  await admin
    .from('payments')
    .update({
      status: 'authorized',
      response_code: commit.response_code,
      authorization_code: commit.authorization_code,
      card_last4: commit.card_detail?.card_number || null,
      payment_type_code: commit.payment_type_code,
      installments_number: commit.installments_number ?? null,
      transaction_date: commit.transaction_date || nowIso,
      raw_response: commit,
      committed_at: nowIso,
    })
    .eq('id', payment.id);

  const { data: reservation } = await admin
    .from('reservations')
    .select('id, space_id, status, payment_status')
    .eq('id', payment.reservation_id)
    .single();

  if (reservation && reservation.status === 'pending') {
    const { data: space } = await admin
      .from('spaces')
      .select('instant_booking')
      .eq('id', reservation.space_id)
      .single();
    const instant = space?.instant_booking ?? true;
    await admin
      .from('reservations')
      .update({
        payment_status: 'paid',
        paid_at: nowIso,
        status: instant ? 'confirmed' : 'pending',
        confirmed_at: instant ? nowIso : null,
      })
      .eq('id', reservation.id);
    return redirect('exito', reservation.id);
  }

  // La reserva expiró o fue anulada mientras se pagaba: se reversa de inmediato.
  try {
    const refund = await transbank<any>(config, 'POST', `/${encodeURIComponent(tokenWs)}/refunds`, {
      amount: Math.round(Number(payment.amount_clp)),
    });
    await admin
      .from('payments')
      .update({ status: 'refunded', refunded_amount_clp: payment.amount_clp, refund_response: refund })
      .eq('id', payment.id);
  } catch {
    // Queda autorizado; administración lo verá en el panel para reversarlo manualmente.
  }
  return redirect('expirado', payment.reservation_id);
}

// Reembolso de un pago hecho con tarjeta guardada (Oneclick Mall, ver api/wallet.ts).
async function oneclickRefund(payment: any, amount: number) {
  const production = process.env.WEBPAY_ENV === 'production';
  const mallCode = process.env.ONECLICK_COMMERCE_CODE || (production ? '' : '597055555541');
  const apiKey = process.env.ONECLICK_API_KEY || (production ? '' : INTEGRATION_API_KEY);
  if (!mallCode || !apiKey) throw new HttpError(503, 'Faltan las credenciales de Oneclick para reembolsar.');
  const host = production ? PRODUCTION_HOST : INTEGRATION_HOST;
  const response = await fetch(
    `${host}/rswebpaytransaction/api/oneclick/v1.2/transactions/${encodeURIComponent(payment.buy_order)}/refunds`,
    {
      method: 'POST',
      headers: { 'Tbk-Api-Key-Id': mallCode, 'Tbk-Api-Key-Secret': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commerce_code: payment.child_commerce_code, detail_buy_order: payment.child_buy_order, amount }),
    }
  );
  const text = await response.text();
  if (!response.ok) throw new HttpError(502, `Transbank respondió ${response.status}: ${text || 'sin detalle'}`);
  return text ? JSON.parse(text) : {};
}

// ---------------------------------------------------------------------------
// refund
// ---------------------------------------------------------------------------
async function handleRefund(req: VercelRequest, res: VercelResponse) {
  const admin = getAdminClient();
  const config = getWebpayConfig();
  const user = await requireUser(req, admin);
  const reservationId = param(req, 'reservationId');
  if (!reservationId) throw new HttpError(400, 'Falta reservationId.');

  const { data: reservation } = await admin
    .from('reservations')
    .select('id, tenant_id, owner_id, payment_status, refund_amount_clp')
    .eq('id', reservationId)
    .single();
  if (!reservation) throw new HttpError(404, 'Reserva no encontrada.');

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  const isParty = reservation.tenant_id === user.id || reservation.owner_id === user.id || profile?.role === 'admin';
  if (!isParty) throw new HttpError(403, 'No autorizado.');

  if (reservation.payment_status !== 'refund_pending') {
    return res.status(200).json({ success: true, skipped: true, paymentStatus: reservation.payment_status });
  }

  const amount = Math.round(Number(reservation.refund_amount_clp || 0));
  const { data: payment } = await admin
    .from('payments')
    .select('*')
    .eq('reservation_id', reservation.id)
    .eq('status', 'authorized')
    .maybeSingle();
  if (!payment || amount <= 0) {
    await admin.from('reservations').update({ payment_status: 'refunded' }).eq('id', reservation.id);
    return res.status(200).json({ success: true, refundedClp: 0 });
  }

  const refund =
    payment.provider === 'oneclick_mall'
      ? await oneclickRefund(payment, amount)
      : await transbank<any>(config, 'POST', `/${encodeURIComponent(payment.token)}/refunds`, { amount });
  const full = amount >= Math.round(Number(payment.amount_clp));
  await admin
    .from('payments')
    .update({
      status: full ? 'refunded' : 'partially_refunded',
      refunded_amount_clp: amount,
      refund_response: refund,
    })
    .eq('id', payment.id);
  await admin
    .from('reservations')
    .update({ payment_status: full ? 'refunded' : 'partially_refunded' })
    .eq('id', reservation.id);

  return res.status(200).json({ success: true, refundedClp: amount, type: refund?.type });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = param(req, 'action');
  try {
    if (action === 'return') return await handleReturn(req, res);
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    if (action === 'create') return await handleCreate(req, res);
    if (action === 'refund') return await handleRefund(req, res);
    return res.status(400).json({ success: false, message: 'Acción no soportada.' });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (!(err instanceof HttpError)) console.error('Error en /api/webpay:', err);
    const message = err instanceof HttpError ? err.message : 'Error inesperado en el servidor de pagos.';
    if (action === 'return') {
      res.statusCode = 303;
      res.setHeader('Location', `${appOrigin(req)}/my-bookings?pago=error`);
      return res.end();
    }
    return res.status(status).json({ success: false, message });
  }
}
