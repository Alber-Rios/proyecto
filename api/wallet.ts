// Billetera de tarjetas con Transbank Oneclick Mall.
//
//   POST /api/wallet?action=inscribe  { returnTo? }              (JWT) inicia la inscripción de una tarjeta
//   GET|POST /api/wallet?action=finish                           (retorno desde Transbank con TBK_TOKEN)
//   POST /api/wallet?action=remove    { cardId }                 (JWT) elimina una tarjeta
//   POST /api/wallet?action=default   { cardId }                 (JWT) marca la tarjeta predeterminada
//   POST /api/wallet?action=pay       { reservationId, cardId }  (JWT) cobra una reserva con una tarjeta guardada
//
// Spotly no recibe ni guarda números de tarjeta: Transbank entrega un identificador
// (tbk_user) que solo usa este backend. Las escrituras se hacen con la service role key.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Credenciales públicas del ambiente de integración publicadas por Transbank.
const INTEGRATION_MALL_CODE = '597055555541';
const INTEGRATION_CHILD_CODE = '597055555542';
const INTEGRATION_API_KEY = '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C';
const INTEGRATION_HOST = 'https://webpay3gint.transbank.cl';
const PRODUCTION_HOST = 'https://webpay3g.transbank.cl';
const API_PATH = '/rswebpaytransaction/api/oneclick/v1.2';
const MAX_CARDS = 5;

type Environment = 'integration' | 'production';

interface OneclickConfig {
  environment: Environment;
  host: string;
  mallCode: string;
  childCode: string;
  apiKey: string;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getConfig(): OneclickConfig {
  const environment: Environment = process.env.WEBPAY_ENV === 'production' ? 'production' : 'integration';
  if (environment === 'production') {
    const mallCode = process.env.ONECLICK_COMMERCE_CODE;
    const childCode = process.env.ONECLICK_CHILD_COMMERCE_CODE;
    const apiKey = process.env.ONECLICK_API_KEY;
    if (!mallCode || !childCode || !apiKey) {
      throw new HttpError(503, 'Oneclick en producción requiere ONECLICK_COMMERCE_CODE, ONECLICK_CHILD_COMMERCE_CODE y ONECLICK_API_KEY.');
    }
    return { environment, host: PRODUCTION_HOST, mallCode, childCode, apiKey };
  }
  return {
    environment,
    host: INTEGRATION_HOST,
    mallCode: process.env.ONECLICK_COMMERCE_CODE || INTEGRATION_MALL_CODE,
    childCode: process.env.ONECLICK_CHILD_COMMERCE_CODE || INTEGRATION_CHILD_CODE,
    apiKey: process.env.ONECLICK_API_KEY || INTEGRATION_API_KEY,
  };
}

function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new HttpError(503, 'El servidor de pagos no está configurado: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function transbank<T>(config: OneclickConfig, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${config.host}${API_PATH}${path}`, {
    method,
    headers: {
      'Tbk-Api-Key-Id': config.mallCode,
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

// Solo rutas internas de la app (evita redirecciones abiertas).
function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.length > 300) {
    return '/billetera';
  }
  return value;
}

function withQuery(path: string, key: string, value: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

function newBuyOrder(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase().slice(0, 26);
}

// ---------------------------------------------------------------------------
// Inscripción de tarjeta
// ---------------------------------------------------------------------------
async function handleInscribe(req: VercelRequest, res: VercelResponse) {
  const admin = getAdminClient();
  const config = getConfig();
  const user = await requireUser(req, admin);
  if (!user.email) throw new HttpError(400, 'Tu cuenta no tiene un correo asociado.');

  const { count } = await admin
    .from('wallet_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active');
  if ((count || 0) >= MAX_CARDS) throw new HttpError(409, `Puedes guardar hasta ${MAX_CARDS} tarjetas. Elimina una para agregar otra.`);

  // Limpia intentos que quedaron a medias.
  await admin
    .from('wallet_cards')
    .delete()
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .lt('created_at', new Date(Date.now() - 30 * 60000).toISOString());

  const started = await transbank<{ token: string; url_webpay: string }>(config, 'POST', '/inscriptions', {
    username: user.id,
    email: user.email.slice(0, 100),
    response_url: `${appOrigin(req)}/api/wallet?action=finish`,
  });

  const { error } = await admin.from('wallet_cards').insert({
    user_id: user.id,
    status: 'pending',
    environment: config.environment,
    inscription_token: started.token,
    return_path: safeReturnPath(param(req, 'returnTo')),
  });
  if (error) throw new HttpError(500, `No se pudo registrar la inscripción: ${error.message}`);

  return res.status(200).json({ success: true, url: started.url_webpay, token: started.token, environment: config.environment });
}

interface FinishResponse {
  response_code: number;
  tbk_user?: string;
  authorization_code?: string;
  card_type?: string;
  card_number?: string;
}

async function handleFinish(req: VercelRequest, res: VercelResponse) {
  const origin = appOrigin(req);
  const redirect = (path: string, result: string) => {
    res.statusCode = 303;
    res.setHeader('Location', `${origin}${withQuery(path, 'tarjeta', result)}`);
    res.end();
  };

  const admin = getAdminClient();
  const config = getConfig();
  const token = param(req, 'TBK_TOKEN');
  if (!token) return redirect('/billetera', 'error');

  const { data: card } = await admin.from('wallet_cards').select('*').eq('inscription_token', token).maybeSingle();
  if (!card) return redirect('/billetera', 'error');
  const back = safeReturnPath(card.return_path);
  if (card.status === 'active') return redirect(back, 'ok');

  let result: FinishResponse;
  try {
    result = await transbank<FinishResponse>(config, 'PUT', `/inscriptions/${encodeURIComponent(token)}`);
  } catch {
    await admin.from('wallet_cards').update({ status: 'failed' }).eq('id', card.id);
    return redirect(back, 'rechazada');
  }

  if (result.response_code !== 0 || !result.tbk_user) {
    await admin.from('wallet_cards').update({ status: 'failed' }).eq('id', card.id);
    return redirect(back, 'rechazada');
  }

  const { count } = await admin
    .from('wallet_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', card.user_id)
    .eq('status', 'active')
    .eq('is_default', true);

  await admin
    .from('wallet_cards')
    .update({
      status: 'active',
      tbk_user: result.tbk_user,
      card_type: result.card_type || null,
      card_last4: (result.card_number || '').replace(/\D/g, '').slice(-4) || null,
      is_default: (count || 0) === 0,
      inscription_token: null,
    })
    .eq('id', card.id);

  return redirect(back, 'ok');
}

// ---------------------------------------------------------------------------
// Gestión de tarjetas
// ---------------------------------------------------------------------------
async function getOwnCard(admin: SupabaseClient, userId: string, cardId: string | undefined) {
  if (!cardId) throw new HttpError(400, 'Falta cardId.');
  const { data: card } = await admin.from('wallet_cards').select('*').eq('id', cardId).maybeSingle();
  if (!card || card.user_id !== userId) throw new HttpError(404, 'Tarjeta no encontrada.');
  return card;
}

async function handleRemove(req: VercelRequest, res: VercelResponse) {
  const admin = getAdminClient();
  const config = getConfig();
  const user = await requireUser(req, admin);
  const card = await getOwnCard(admin, user.id, param(req, 'cardId'));

  if (card.status === 'active' && card.tbk_user) {
    try {
      await transbank(config, 'DELETE', '/inscriptions', { tbk_user: card.tbk_user, username: user.id });
    } catch (err) {
      // Si Transbank ya no la reconoce, igual se elimina de la billetera.
      if (!(err instanceof HttpError) || !/\b404\b/.test(err.message)) throw err;
    }
  }
  await admin.from('wallet_cards').delete().eq('id', card.id);

  if (card.is_default) {
    const { data: next } = await admin
      .from('wallet_cards')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) await admin.from('wallet_cards').update({ is_default: true }).eq('id', next.id);
  }
  return res.status(200).json({ success: true });
}

async function handleDefault(req: VercelRequest, res: VercelResponse) {
  const admin = getAdminClient();
  const user = await requireUser(req, admin);
  const card = await getOwnCard(admin, user.id, param(req, 'cardId'));
  if (card.status !== 'active') throw new HttpError(409, 'La tarjeta no está activa.');
  await admin.from('wallet_cards').update({ is_default: false }).eq('user_id', user.id).neq('id', card.id);
  await admin.from('wallet_cards').update({ is_default: true }).eq('id', card.id);
  return res.status(200).json({ success: true });
}

// ---------------------------------------------------------------------------
// Pago de una reserva con tarjeta guardada
// ---------------------------------------------------------------------------
interface AuthorizeDetail {
  amount: number;
  status: string;
  authorization_code?: string;
  payment_type_code?: string;
  response_code: number;
  installments_number?: number;
  commerce_code: string;
  buy_order: string;
}

interface AuthorizeResponse {
  buy_order: string;
  card_detail?: { card_number?: string };
  transaction_date?: string;
  details: AuthorizeDetail[];
}

async function cancelUnpaid(admin: SupabaseClient, reservationId: string, reason: string) {
  await admin
    .from('reservations')
    .update({
      status: 'cancelled',
      payment_status: 'failed',
      refund_amount_clp: 0,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
    })
    .eq('id', reservationId)
    .eq('payment_status', 'pending');
}

async function handlePay(req: VercelRequest, res: VercelResponse) {
  const admin = getAdminClient();
  const config = getConfig();
  const user = await requireUser(req, admin);
  const reservationId = param(req, 'reservationId');
  if (!reservationId) throw new HttpError(400, 'Falta reservationId.');
  const card = await getOwnCard(admin, user.id, param(req, 'cardId'));
  if (card.status !== 'active' || !card.tbk_user) throw new HttpError(409, 'La tarjeta no está activa.');

  const { data: reservation } = await admin
    .from('reservations')
    .select('id, tenant_id, space_id, total_clp, status, payment_status')
    .eq('id', reservationId)
    .single();
  if (!reservation) throw new HttpError(404, 'Reserva no encontrada.');
  if (reservation.tenant_id !== user.id) throw new HttpError(403, 'La reserva no pertenece a tu cuenta.');
  if (reservation.status !== 'pending' || reservation.payment_status !== 'pending') {
    throw new HttpError(409, 'Esta reserva ya no admite pagos (fue pagada, anulada o expiró).');
  }

  const amount = Math.round(Number(reservation.total_clp));
  const buyOrder = newBuyOrder('SO');
  const childBuyOrder = newBuyOrder('SC');

  const { data: payment, error: insertError } = await admin
    .from('payments')
    .insert({
      reservation_id: reservation.id,
      tenant_id: user.id,
      provider: 'oneclick_mall',
      environment: config.environment,
      buy_order: buyOrder,
      session_id: user.id.slice(0, 61),
      amount_clp: amount,
      status: 'created',
      wallet_card_id: card.id,
      child_commerce_code: config.childCode,
      child_buy_order: childBuyOrder,
    })
    .select('id')
    .single();
  if (insertError || !payment) throw new HttpError(500, `No se pudo registrar el pago: ${insertError?.message}`);

  let result: AuthorizeResponse;
  try {
    result = await transbank<AuthorizeResponse>(config, 'POST', '/transactions', {
      username: user.id,
      tbk_user: card.tbk_user,
      buy_order: buyOrder,
      details: [{ commerce_code: config.childCode, buy_order: childBuyOrder, amount, installments_number: 1 }],
    });
  } catch {
    // Si la respuesta se perdió, el estado de la transacción es la fuente de verdad.
    try {
      result = await transbank<AuthorizeResponse>(config, 'GET', `/transactions/${encodeURIComponent(buyOrder)}`);
    } catch {
      await admin.from('payments').update({ status: 'failed', committed_at: new Date().toISOString() }).eq('id', payment.id);
      await cancelUnpaid(admin, reservation.id, 'No fue posible cobrar la tarjeta guardada');
      return res.status(200).json({ success: false, status: 'rejected', message: 'No fue posible procesar el pago. No se realizó ningún cargo.' });
    }
  }

  const detail = result.details?.[0];
  const approved =
    detail &&
    detail.response_code === 0 &&
    detail.status === 'AUTHORIZED' &&
    Math.round(Number(detail.amount)) === amount &&
    detail.buy_order === childBuyOrder;
  const nowIso = new Date().toISOString();

  if (!approved) {
    await admin
      .from('payments')
      .update({ status: 'failed', response_code: detail?.response_code ?? null, raw_response: result, committed_at: nowIso })
      .eq('id', payment.id);
    await cancelUnpaid(admin, reservation.id, 'Pago rechazado por Transbank (tarjeta guardada)');
    return res.status(200).json({
      success: false,
      status: 'rejected',
      message: 'El banco rechazó el pago con esta tarjeta. Prueba con otra tarjeta o con Webpay.',
    });
  }

  await admin
    .from('payments')
    .update({
      status: 'authorized',
      response_code: detail.response_code,
      authorization_code: detail.authorization_code,
      card_last4: (result.card_detail?.card_number || card.card_last4 || '').replace(/\D/g, '').slice(-4) || null,
      payment_type_code: detail.payment_type_code,
      installments_number: detail.installments_number ?? null,
      transaction_date: result.transaction_date || nowIso,
      raw_response: result,
      committed_at: nowIso,
    })
    .eq('id', payment.id);

  // Confirmación de la reserva (misma regla que el retorno de Webpay Plus).
  const { data: current } = await admin.from('reservations').select('status').eq('id', reservation.id).single();
  if (current?.status === 'pending') {
    const { data: space } = await admin.from('spaces').select('instant_booking').eq('id', reservation.space_id).single();
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
    return res.status(200).json({ success: true, status: 'paid', reservationId: reservation.id });
  }

  // La reserva expiró mientras se cobraba: se reversa de inmediato.
  try {
    const refund = await transbank<any>(config, 'POST', `/transactions/${encodeURIComponent(buyOrder)}/refunds`, {
      commerce_code: config.childCode,
      detail_buy_order: childBuyOrder,
      amount,
    });
    await admin
      .from('payments')
      .update({ status: 'refunded', refunded_amount_clp: amount, refund_response: refund })
      .eq('id', payment.id);
  } catch {
    // Queda autorizado; administración lo verá en el panel para reversarlo manualmente.
  }
  return res.status(200).json({ success: false, status: 'expired', message: 'La reserva expiró antes del pago; el cobro fue reversado.' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = param(req, 'action');
  try {
    if (action === 'finish') return await handleFinish(req, res);
    if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    if (action === 'inscribe') return await handleInscribe(req, res);
    if (action === 'remove') return await handleRemove(req, res);
    if (action === 'default') return await handleDefault(req, res);
    if (action === 'pay') return await handlePay(req, res);
    return res.status(400).json({ success: false, message: 'Acción no soportada.' });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Error inesperado en la billetera.';
    if (action === 'finish') {
      res.statusCode = 303;
      res.setHeader('Location', `${appOrigin(req)}/billetera?tarjeta=error`);
      return res.end();
    }
    return res.status(status).json({ success: false, message });
  }
}
