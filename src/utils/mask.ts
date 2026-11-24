import { cleanRut, formatRut } from './formatters.ts';

// Enmascarado de datos personales para la pantalla: si alguien saca una foto o
// comparte la pantalla, no se ve el dato completo. El dato real sigue disponible
// con el botón "mostrar" (componente <Sensitive>) y en los documentos impresos.

const DOT = '•';

/** 23.401.204-5 → 23.•••.•••-5 */
export function maskRut(raw?: string | null): string {
  const rut = formatRut(raw || '');
  if (!rut) return '';
  const clean = cleanRut(rut);
  if (clean.length < 4) return rut;
  const [body, dv] = rut.split('-');
  const groups = body.split('.');
  const masked = groups.map((g, i) => (i === 0 ? g : DOT.repeat(g.length))).join('.');
  return `${masked}-${dv}`;
}

/** u25046021@gmail.com → u2•••••••@gmail.com */
export function maskEmail(raw?: string | null): string {
  const email = (raw || '').trim();
  const at = email.lastIndexOf('@');
  if (at < 1) return email ? DOT.repeat(Math.min(email.length, 8)) : '';
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = user.length <= 2 ? 1 : 2;
  return `${user.slice(0, keep)}${DOT.repeat(Math.max(user.length - keep, 3))}@${domain}`;
}

/** +56965321554 → +56 9 •••• 1554 */
export function maskPhone(raw?: string | null): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length < 6) return DOT.repeat(digits.length);
  const last = digits.slice(-4);
  if (digits.startsWith('569') && digits.length === 11) return `+56 9 ${DOT.repeat(4)} ${last}`;
  return `${(raw || '').trim().startsWith('+') ? '+' : ''}${DOT.repeat(Math.max(digits.length - 4, 4))} ${last}`;
}

/** Número de cuenta bancaria → •••• 1234 */
export function maskAccountNumber(raw?: string | null): string {
  const n = (raw || '').replace(/\s/g, '');
  return n.length <= 4 ? n : `${DOT.repeat(4)} ${n.slice(-4)}`;
}

/** Número de serie de la cédula → ••••••789 */
export function maskSerial(raw?: string | null): string {
  const n = (raw || '').trim();
  return n.length <= 3 ? n : `${DOT.repeat(n.length - 3)}${n.slice(-3)}`;
}

export type SensitiveKind = 'rut' | 'email' | 'phone' | 'account' | 'serial';

export function maskValue(kind: SensitiveKind, value?: string | null): string {
  switch (kind) {
    case 'rut':
      return maskRut(value);
    case 'email':
      return maskEmail(value);
    case 'phone':
      return maskPhone(value);
    case 'account':
      return maskAccountNumber(value);
    case 'serial':
      return maskSerial(value);
  }
}

export function plainValue(kind: SensitiveKind, value?: string | null): string {
  return kind === 'rut' ? formatRut(value || '') : (value || '').trim();
}

/** Enmascara correos, RUT y celulares dentro de un texto libre (por ejemplo, el detalle de un registro). */
export function maskText(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m))
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, (m) => maskRut(m))
    .replace(/\+?56\s?9\s?\d{4}\s?\d{4}/g, (m) => maskPhone(m));
}
