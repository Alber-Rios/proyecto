import { describe, expect, it } from 'vitest';
import vercel from '../../vercel.json';
import { buildCsp, SECURITY_HEADERS } from '../../api/_security.ts';

describe('cabeceras de seguridad', () => {
  const headers = Object.fromEntries((vercel.headers[0].headers as { key: string; value: string }[]).map((h) => [h.key, h.value]));
  it('vercel.json usa la misma CSP que el servidor', () => {
    expect(headers['Content-Security-Policy']).toBe(buildCsp());
  });
  it('vercel.json incluye todas las cabeceras de seguridad', () => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(headers[k]).toBe(v);
  });
  it('la CSP no permite scripts en línea ni ser incrustada', () => {
    const csp = buildCsp();
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});
