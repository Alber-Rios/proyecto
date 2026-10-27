import { describe, expect, it } from 'vitest';
import { checkPassword, passwordProblem, passwordScore } from './passwordPolicy.ts';

describe('política de contraseñas', () => {
  it('exige largo, minúscula, mayúscula y número', () => {
    expect(passwordProblem('corta1A')).toMatch(/caracteres/);
    expect(passwordProblem('sinmayuscula1')).toMatch(/mayúscula/);
    expect(passwordProblem('SINMINUSCULA1')).toMatch(/minúscula/);
    expect(passwordProblem('SinNumeros')).toMatch(/número/);
    expect(passwordProblem('Segura2026x')).toBeNull();
  });
  it('rechaza datos personales y contraseñas comunes', () => {
    expect(passwordProblem('Albert2026x', { names: ['Albert Ríos'] })).toMatch(/nombre/);
    expect(passwordProblem('Ana.perez99X', { email: 'ana.perez99@correo.cl' })).toMatch(/nombre/);
    expect(passwordProblem('Password1')).toMatch(/común/);
  });
  it('limita a 72 bytes (límite de bcrypt)', () => {
    expect(checkPassword('Aa1' + 'x'.repeat(80)).find((c) => c.id === 'length')?.ok).toBe(false);
  });
  it('puntaje creciente', () => {
    expect(passwordScore('')).toBe(0);
    expect(passwordScore('abc')).toBeLessThan(passwordScore('Segura2026x'));
    expect(passwordScore('Una-Clave-Muy-Larga-2026')).toBe(4);
  });
});
