// Política de contraseñas de Spotly. La usan el formulario (para avisar al tiro)
// y el servidor (que es quien decide). Supabase Auth guarda solo el hash bcrypt
// de la contraseña: nadie, ni administración, puede volver a leerla.

export const PASSWORD_MIN = 8;
// bcrypt solo considera los primeros 72 bytes; más largo daría una falsa sensación de seguridad.
export const PASSWORD_MAX = 72;

export interface PasswordCheck {
  id: 'length' | 'lower' | 'upper' | 'digit' | 'personal' | 'common';
  label: string;
  ok: boolean;
}

const COMMON = new Set([
  'password', 'password1', 'contraseña', 'contrasena', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyui', 'abc12345', 'abcd1234', 'spotly123', 'spotly2026', 'iloveyou', 'admin123',
  'chile123', 'chile2026', 'aaaaaaaa', '11111111', '00000000', 'passw0rd', 'Password1',
]);

export function checkPassword(password: string, personal: { email?: string; names?: string[]; rut?: string } = {}): PasswordCheck[] {
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

export function passwordProblem(password: string, personal?: Parameters<typeof checkPassword>[1]): string | null {
  const failed = checkPassword(password, personal).find((c) => !c.ok);
  return failed ? `La contraseña debe cumplir: ${failed.label.toLowerCase()}.` : null;
}

/** 0 a 4, para la barra de seguridad del formulario. */
export function passwordScore(password: string, personal?: Parameters<typeof checkPassword>[1]): number {
  if (!password) return 0;
  const checks = checkPassword(password, personal);
  const passed = checks.filter((c) => c.ok).length;
  let score = Math.max(0, passed - 2); // 0..4
  if (password.length >= 12 && passed === checks.length) score = 4;
  else if (passed === checks.length) score = Math.min(score, 3);
  return Math.min(4, score);
}
