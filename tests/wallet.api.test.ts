// Vive fuera de /api para que Vercel no la publique como función.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Base de datos en memoria con el subconjunto de la API de supabase-js que usa /api/wallet.
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let idSeq = 0;

function query(table: string) {
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let payload: any = null;
  let countMode = false;
  let returning = false;
  const filters: ((r: Row) => boolean)[] = [];
  const rows = () => (db[table] ||= []);
  const matches = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === 'insert') {
      const created = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `id${++idSeq}`, created_at: new Date(Date.now() + idSeq).toISOString(), ...p }));
      rows().push(...created);
      return { data: returning ? created : null, error: null };
    }
    if (op === 'update') {
      const hit = matches();
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit, error: null };
    }
    if (op === 'delete') {
      const hit = new Set(matches());
      db[table] = rows().filter((r) => !hit.has(r));
      return { data: null, error: null };
    }
    const hit = matches();
    return countMode ? { data: null, count: hit.length, error: null } : { data: hit, error: null };
  };
  const b: any = {
    select: (_cols?: string, opts?: any) => {
      if (op === 'select') countMode = Boolean(opts?.count);
      else returning = true;
      return b;
    },
    insert: (p: any) => ((op = 'insert'), (payload = p), b),
    update: (p: any) => ((op = 'update'), (payload = p), b),
    delete: () => ((op = 'delete'), b),
    eq: (k: string, v: any) => (filters.push((r) => r[k] === v), b),
    neq: (k: string, v: any) => (filters.push((r) => r[k] !== v), b),
    lt: (k: string, v: any) => (filters.push((r) => r[k] < v), b),
    order: () => b,
    limit: () => b,
    single: async () => {
      const r = run();
      const list = Array.isArray(r.data) ? r.data : [];
      return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { message: 'not single' } };
    },
    maybeSingle: async () => {
      const r = run();
      return { data: Array.isArray(r.data) ? r.data[0] ?? null : null, error: null };
    },
    then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => query(t),
    auth: {
      getUser: async (token: string) =>
        token === 'tok-user'
          ? { data: { user: { id: 'user-1', email: 'u@spotly.cl' } }, error: null }
          : { data: { user: null }, error: { message: 'bad' } },
    },
  }),
}));

const { default: handler } = await import('../api/wallet.ts');

function call(action: string, body: any = {}, opts: { method?: string; auth?: boolean } = {}) {
  const req: any = {
    method: opts.method || 'POST',
    query: { action },
    body,
    headers: { authorization: opts.auth === false ? '' : 'Bearer tok-user', host: 'spotly.test', 'x-forwarded-proto': 'https' },
  };
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return Promise.resolve(handler(req, res)).then(() => res);
}

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as any;
const reply = (status: number, body: any) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  fetchMock.mockReset();
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  delete process.env.WEBPAY_ENV;
  delete process.env.PUBLIC_APP_URL;
});

describe('/api/wallet', () => {
  it('inscribe una tarjeta y la activa al volver de Transbank', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { token: 'TBK1', url_webpay: 'https://webpay3gint.transbank.cl/inscripcion' }));
    const start = await call('inscribe', { returnTo: '/space/spc_1?retomar=1' });
    expect(start.body).toMatchObject({ success: true, token: 'TBK1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://webpay3gint.transbank.cl/rswebpaytransaction/api/oneclick/v1.2/inscriptions');
    expect(JSON.parse(init.body)).toEqual({
      username: 'user-1',
      email: 'u@spotly.cl',
      response_url: 'https://spotly.test/api/wallet?action=finish',
    });
    expect(db.wallet_cards[0]).toMatchObject({ status: 'pending', return_path: '/space/spc_1?retomar=1' });

    fetchMock.mockResolvedValueOnce(
      reply(200, { response_code: 0, tbk_user: 'tbk-user-xyz', card_type: 'Visa', card_number: 'XXXXXXXXXXXX6623' })
    );
    const done = await call('finish', { TBK_TOKEN: 'TBK1' }, { method: 'POST', auth: false });
    expect(done.statusCode).toBe(303);
    expect(done.headers.Location).toBe('https://spotly.test/space/spc_1?retomar=1&tarjeta=ok');
    expect(db.wallet_cards[0]).toMatchObject({ status: 'active', card_last4: '6623', card_type: 'Visa', is_default: true });
  });

  it('no permite redirecciones a otros sitios', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { token: 'TBK2', url_webpay: 'https://x' }));
    await call('inscribe', { returnTo: '//evil.com' });
    expect(db.wallet_cards[0].return_path).toBe('/billetera');
  });

  it('marca la inscripción rechazada', async () => {
    db.wallet_cards = [{ id: 'c1', user_id: 'user-1', status: 'pending', inscription_token: 'TBK3', return_path: '/billetera' }];
    fetchMock.mockResolvedValueOnce(reply(200, { response_code: -96 }));
    const res = await call('finish', { TBK_TOKEN: 'TBK3' }, { auth: false });
    expect(res.headers.Location).toBe('https://spotly.test/billetera?tarjeta=rechazada');
    expect(db.wallet_cards[0].status).toBe('failed');
  });

  describe('pago con tarjeta guardada', () => {
    beforeEach(() => {
      db.wallet_cards = [{ id: 'c1', user_id: 'user-1', status: 'active', tbk_user: 'tbk-1', card_last4: '6623', is_default: true }];
      db.reservations = [{ id: 'res1', tenant_id: 'user-1', space_id: 'spc_1', total_clp: 105000, status: 'pending', payment_status: 'pending' }];
      db.spaces = [{ id: 'spc_1', instant_booking: true }];
    });

    it('cobra el total de la reserva y la confirma', async () => {
      fetchMock.mockImplementationOnce(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        expect(body.details[0]).toMatchObject({ commerce_code: '597055555542', amount: 105000, installments_number: 1 });
        return reply(200, {
          buy_order: body.buy_order,
          card_detail: { card_number: '6623' },
          details: [{ ...body.details[0], status: 'AUTHORIZED', response_code: 0, authorization_code: '1213' }],
        });
      });
      const res = await call('pay', { reservationId: 'res1', cardId: 'c1' });
      expect(res.body).toMatchObject({ success: true, status: 'paid' });
      expect(db.payments[0]).toMatchObject({ provider: 'oneclick_mall', status: 'authorized', amount_clp: 105000, authorization_code: '1213' });
      expect(db.reservations[0]).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
    });

    it('si el banco rechaza, libera la reserva sin cobro', async () => {
      fetchMock.mockImplementationOnce(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        return reply(200, { buy_order: body.buy_order, details: [{ ...body.details[0], status: 'FAILED', response_code: -1 }] });
      });
      const res = await call('pay', { reservationId: 'res1', cardId: 'c1' });
      expect(res.body).toMatchObject({ success: false, status: 'rejected' });
      expect(db.payments[0].status).toBe('failed');
      expect(db.reservations[0]).toMatchObject({ status: 'cancelled', payment_status: 'failed' });
    });

    it('no cobra reservas ajenas ni tarjetas de otro usuario', async () => {
      db.reservations[0].tenant_id = 'otro';
      const res = await call('pay', { reservationId: 'res1', cardId: 'c1' });
      expect(res.statusCode).toBe(403);
      db.reservations[0].tenant_id = 'user-1';
      db.wallet_cards[0].user_id = 'otro';
      const res2 = await call('pay', { reservationId: 'res1', cardId: 'c1' });
      expect(res2.statusCode).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('exige sesión', async () => {
      const res = await call('pay', { reservationId: 'res1', cardId: 'c1' }, { auth: false });
      expect(res.statusCode).toBe(401);
    });
  });

  it('elimina la tarjeta en Transbank y pasa la predeterminada a otra', async () => {
    db.wallet_cards = [
      { id: 'c1', user_id: 'user-1', status: 'active', tbk_user: 'tbk-1', is_default: true, created_at: '2026-10-01' },
      { id: 'c2', user_id: 'user-1', status: 'active', tbk_user: 'tbk-2', is_default: false, created_at: '2026-10-02' },
    ];
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });
    const res = await call('remove', { cardId: 'c1' });
    expect(res.body).toEqual({ success: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ tbk_user: 'tbk-1', username: 'user-1' });
    expect(db.wallet_cards).toHaveLength(1);
    expect(db.wallet_cards[0]).toMatchObject({ id: 'c2', is_default: true });
  });
});
