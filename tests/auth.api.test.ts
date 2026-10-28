// Pruebas de /api/auth (sesión en cookie HttpOnly, registro con código y recuperación).
// Vive fuera de /api para que Vercel no la publique como función.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  users: [] as { id: string; email: string; confirmed: boolean; password: string; meta?: any }[],
  rpcCalls: [] as { fn: string; args: any }[],
  locked: false,
  sent: [] as { to: string; subject: string; text: string }[],
  signOuts: [] as { token: string; scope: string }[],
  passwordUpdates: [] as { id: string; password: string }[],
  deleted: [] as string[],
  suspended: new Set<string>(),
  rpcMissing: false,
  resendFails: false,
};

const session = (id: string, email: string, tag = 'a') => ({
  access_token: `access-${tag}-${id}`,
  refresh_token: `refresh-${tag}-${id}`,
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id, email, email_confirmed_at: '2026-01-01', user_metadata: { first_names: 'Ana', surnames: 'Pérez' } },
});

const admin = {
  rpc: vi.fn(async (fn: string, args: any) => {
    state.rpcCalls.push({ fn, args });
    if (fn === 'login_lock_status') return { data: { locked: state.locked } };
    if (fn === 'register_failed_login') return { data: { locked: false, remaining: 4 } };
    if (fn === 'auth_account_status' && state.rpcMissing) return { data: null, error: { message: 'Could not find the function public.auth_account_status' } };
    if (fn === 'auth_account_status') {
      const u = state.users.find((x) => x.email === args.p_email);
      return { data: u ? [{ user_id: u.id, email_confirmed: u.confirmed, created_at: '2026-01-01' }] : [] };
    }
    if (fn === 'check_signup_availability') return { data: [{ email_taken: false, rut_taken: false }] };
    return { data: null };
  }),
  from: () => {
    let id = '';
    const b: any = {
      select: () => b,
      eq: (_k: string, v: string) => ((id = v), b),
      maybeSingle: async () => ({ data: { is_suspended: state.suspended.has(id), suspended_reason: null, first_names: 'Ana' } }),
    };
    return b;
  },
  auth: {
    getUser: vi.fn(async (token: string) => {
      const id = token.split('-').pop()!;
      const u = state.users.find((x) => x.id === id);
      return u ? { data: { user: { id, email: u.email, user_metadata: {} } }, error: null } : { data: { user: null }, error: { message: 'bad' } };
    }),
    admin: {
      listUsers: vi.fn(async () => ({ data: { users: state.users.map((u) => ({ id: u.id, email: u.email, email_confirmed_at: u.confirmed ? '2026-01-01' : null, created_at: '2026-01-01' })) }, error: null })),
      signOut: vi.fn(async (token: string, scope: string) => {
        state.signOuts.push({ token, scope });
        return { error: null };
      }),
      deleteUser: vi.fn(async (id: string) => {
        state.deleted.push(id);
        state.users = state.users.filter((u) => u.id !== id);
        return { error: null };
      }),
      updateUserById: vi.fn(async (id: string, attrs: { password: string }) => {
        state.passwordUpdates.push({ id, password: attrs.password });
        return { error: null };
      }),
      generateLink: vi.fn(async (p: any) => {
        if (p.type === 'signup') state.users.push({ id: `u${state.users.length + 1}`, email: p.email, confirmed: false, password: p.password });
        return { data: { properties: { email_otp: '123456', hashed_token: 'hash-1' } }, error: null };
      }),
    },
  },
};

const anon = () => ({
  auth: {
    signInWithPassword: vi.fn(async ({ email, password }: any) => {
      const u = state.users.find((x) => x.email === email && x.password === password);
      if (!u) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
      if (!u.confirmed) return { data: { session: null, user: null }, error: { message: 'Email not confirmed' } };
      const s = session(u.id, email);
      return { data: { session: s, user: s.user }, error: null };
    }),
    refreshSession: vi.fn(async ({ refresh_token }: any) => {
      const m = /^refresh-\w+-(.+)$/.exec(refresh_token);
      const u = m && state.users.find((x) => x.id === m[1]);
      if (!u) return { data: { session: null, user: null }, error: { message: 'Invalid Refresh Token' } };
      const s = session(u.id, u.email, 'b');
      return { data: { session: s, user: s.user }, error: null };
    }),
    verifyOtp: vi.fn(async (p: any) => {
      if (p.token_hash) {
        if (p.token_hash !== 'hash-1') return { data: { session: null, user: null }, error: { message: 'expired' } };
        const u = state.users[0];
        const s = session(u.id, u.email, 'r');
        return { data: { session: s, user: s.user }, error: null };
      }
      const u = state.users.find((x) => x.email === p.email);
      if (!u || p.token !== '123456') return { data: { session: null, user: null }, error: { message: 'Token has expired or is invalid' } };
      u.confirmed = true;
      const s = session(u.id, u.email, 'v');
      return { data: { session: s, user: s.user }, error: null };
    }),
    signOut: vi.fn(async () => ({ error: null })),
  },
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, key: string) => (key === 'service-key' ? admin : anon()),
}));

const { default: handler } = await import('../api/auth.ts');

function call(action: string, body: any = {}, opts: { cookie?: string; headers?: Record<string, string> } = {}) {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, any>,
    body: null as any,
    setHeader(k: string, v: any) {
      this.headers[k.toLowerCase()] = v;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: any) {
      this.body = b;
      return this;
    },
    end() {
      return this;
    },
  };
  const req: any = {
    method: 'POST',
    query: { action },
    body,
    headers: { host: 'spotly.cl', origin: 'https://spotly.cl', 'x-spotly-request': '1', 'x-forwarded-for': '10.0.0.1', cookie: opts.cookie || '', ...(opts.headers || {}) },
    socket: {},
  };
  return Promise.resolve(handler(req, res)).then(() => res);
}
const cookies = (res: any): string[] => [].concat(res.headers['set-cookie'] || []);

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  process.env.RESEND_API_KEY = 're_test';
  process.env.PUBLIC_APP_URL = 'https://spotly.cl';
  Object.assign(state, { users: [{ id: 'u1', email: 'ana@correo.cl', confirmed: true, password: 'Segura2026x' }], rpcCalls: [], locked: false, rpcMissing: false, resendFails: false, sent: [], signOuts: [], passwordUpdates: [], deleted: [], suspended: new Set() });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
    const b = JSON.parse(init.body);
    if (state.resendFails) return new Response('{"message":"domain not verified"}', { status: 403 });
    state.sent.push({ to: b.to[0], subject: b.subject, text: b.text });
    return new Response('{}', { status: 200 });
  }));
});

describe('/api/auth', () => {
  it('rechaza solicitudes sin la cabecera anti-CSRF o desde otro sitio', async () => {
    expect((await call('login', {}, { headers: { 'x-spotly-request': '' } })).statusCode).toBe(403);
    expect((await call('login', {}, { headers: { origin: 'https://malo.com' } })).statusCode).toBe(403);
  });

  it('login deja el refresh token solo en una cookie HttpOnly, Secure y SameSite=Strict', async () => {
    const res = await call('login', { email: 'ana@correo.cl', password: 'Segura2026x', remember: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.session.access_token).toBe('access-a-u1');
    expect(JSON.stringify(res.body)).not.toContain('refresh');
    const rt = cookies(res).find((c) => c.startsWith('spotly_rt='))!;
    expect(rt).toContain('HttpOnly');
    expect(rt).toContain('Secure');
    expect(rt).toContain('SameSite=Strict');
    expect(rt).toContain('Path=/api/auth');
    expect(rt).toContain('Max-Age=2592000');
  });

  it('sin "recordar sesión" la cookie dura solo hasta cerrar el navegador', async () => {
    const res = await call('login', { email: 'ana@correo.cl', password: 'Segura2026x', remember: false });
    expect(cookies(res).find((c) => c.startsWith('spotly_rt='))).not.toContain('Max-Age');
  });

  it('no deja entrar con el correo sin verificar', async () => {
    state.users.push({ id: 'u2', email: 'nuevo@correo.cl', confirmed: false, password: 'Segura2026x' });
    const res = await call('login', { email: 'nuevo@correo.cl', password: 'Segura2026x' });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(cookies(res)).toHaveLength(0);
  });

  it('contraseña incorrecta suma un intento fallido y no crea cookie', async () => {
    const res = await call('login', { email: 'ana@correo.cl', password: 'otra' });
    expect(res.statusCode).toBe(401);
    expect(state.rpcCalls.some((c) => c.fn === 'register_failed_login')).toBe(true);
    expect(cookies(res)).toHaveLength(0);
  });

  it('refresh renueva la sesión con la cookie y sin cookie no hay sesión', async () => {
    const none = await call('refresh');
    expect(none.body.session).toBeNull();
    const res = await call('refresh', {}, { cookie: 'spotly_rt=refresh-a-u1; spotly_rm=1' });
    expect(res.body.session.access_token).toBe('access-b-u1');
    expect(cookies(res)[0]).toContain('spotly_rt=refresh-b-u1');
  });

  it('refresh con una cookie inválida la borra', async () => {
    const res = await call('refresh', {}, { cookie: 'spotly_rt=falsa' });
    expect(res.body.session).toBeNull();
    expect(cookies(res)[0]).toContain('Max-Age=0');
  });

  it('logout revoca la sesión en Supabase y borra la cookie', async () => {
    const res = await call('logout', {}, { headers: { authorization: 'Bearer access-a-u1' } });
    expect(state.signOuts).toContainEqual({ token: 'access-a-u1', scope: 'local' });
    expect(cookies(res).every((c) => c.includes('Max-Age=0'))).toBe(true);
  });

  it('registro: rechaza contraseñas débiles', async () => {
    const res = await call('signup', { email: 'x@correo.cl', password: 'abc123', firstNames: 'Ana', surnames: 'Soto', rut: '12.345.678-5', agreedTerms: true, birthDate: '1990-01-01' });
    expect(res.statusCode).toBe(400);
    expect(state.sent).toHaveLength(0);
  });

  it('registro: crea la cuenta sin activar y envía el código al correo', async () => {
    const res = await call('signup', { email: 'nuevo@correo.cl', password: 'Segura2026x', firstNames: 'Luis', surnames: 'Soto', rut: '12.345.678-5', agreedTerms: true, birthDate: '1990-01-01', role: 'tenant' });
    expect(res.statusCode).toBe(200);
    expect(cookies(res)).toHaveLength(0); // sin sesión hasta validar el código
    expect(state.users.find((u) => u.email === 'nuevo@correo.cl')?.confirmed).toBe(false);
    expect(state.sent[0].to).toBe('nuevo@correo.cl');
    expect(state.sent[0].text).toContain('123456');
  });

  it('registro: reemplaza un registro anterior que nunca validó su correo', async () => {
    state.users.push({ id: 'viejo', email: 'nuevo@correo.cl', confirmed: false, password: 'x' });
    await call('signup', { email: 'nuevo@correo.cl', password: 'Segura2026x', firstNames: 'Luis', surnames: 'Soto', rut: '12.345.678-5', agreedTerms: true, birthDate: '1990-01-01' });
    expect(state.deleted).toContain('viejo');
  });

  it('registro: no permite un correo ya verificado', async () => {
    const res = await call('signup', { email: 'ana@correo.cl', password: 'Segura2026x', firstNames: 'Luis', surnames: 'Soto', rut: '12.345.678-5', agreedTerms: true, birthDate: '1990-01-01' });
    expect(res.statusCode).toBe(409);
  });

  it('código incorrecto suma un intento; el correcto activa la cuenta y abre sesión', async () => {
    state.users.push({ id: 'u2', email: 'nuevo@correo.cl', confirmed: false, password: 'Segura2026x' });
    const bad = await call('verify', { email: 'nuevo@correo.cl', code: '000000' });
    expect(bad.statusCode).toBe(400);
    expect(state.rpcCalls.some((c) => c.fn === 'register_failed_login' && c.args.p_email === 'otp:nuevo@correo.cl')).toBe(true);
    const ok = await call('verify', { email: 'nuevo@correo.cl', code: '123456' });
    expect(ok.statusCode).toBe(200);
    expect(ok.body.session.user.id).toBe('u2');
    expect(cookies(ok)[0]).toContain('HttpOnly');
  });

  it('recuperar contraseña: misma respuesta exista o no la cuenta, y solo envía a cuentas reales', async () => {
    const unknown = await call('forgot', { email: 'nadie@correo.cl' });
    const known = await call('forgot', { email: 'ana@correo.cl' });
    expect(unknown.body.message).toBe(known.body.message);
    expect(state.sent.map((s) => s.to)).toEqual(['ana@correo.cl']);
    expect(state.sent[0].text).toContain('https://spotly.cl/restablecer-contrasena?token_hash=hash-1&type=recovery');
  });

  it('recuperar contraseña funciona aunque falte el parche SQL (usa la API de administración)', async () => {
    state.rpcMissing = true;
    const res = await call('forgot', { email: 'ana@correo.cl' });
    expect(res.statusCode).toBe(200);
    expect(state.sent.map((s) => s.to)).toEqual(['ana@correo.cl']);
  });

  it('si el correo no se puede enviar, avisa en vez de decir que se envió', async () => {
    state.resendFails = true;
    const res = await call('forgot', { email: 'ana@correo.cl' });
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('EMAIL_NOT_SENT');
  });

  it('restablecer: enlace inválido no cambia nada', async () => {
    const res = await call('reset', { token_hash: 'otro', password: 'NuevaClave2026' });
    expect(res.body.code).toBe('LINK_INVALID');
    expect(state.passwordUpdates).toHaveLength(0);
  });

  it('restablecer: valida la contraseña, la guarda y cierra todas las sesiones', async () => {
    const weak = await call('reset', { token_hash: 'hash-1', password: '1234' });
    expect(weak.statusCode).toBe(400);
    const res = await call('reset', { token_hash: 'hash-1', password: 'NuevaClave2026' });
    expect(res.statusCode).toBe(200);
    expect(state.passwordUpdates).toEqual([{ id: 'u1', password: 'NuevaClave2026' }]);
    expect(state.signOuts.some((s) => s.scope === 'global')).toBe(true);
    expect(cookies(res).every((c) => c.includes('Max-Age=0'))).toBe(true);
  });
});
