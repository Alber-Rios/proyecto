import { describe, expect, it } from 'vitest';
import { maskAccountNumber, maskEmail, maskPhone, maskRut } from './mask.ts';

describe('enmascarado de datos personales', () => {
  it('RUT: deja los primeros dígitos y el dígito verificador', () => {
    expect(maskRut('234012045')).toBe('23.•••.•••-5');
    expect(maskRut('23.401.204-5')).toBe('23.•••.•••-5');
    expect(maskRut('9.876.543-K')).toBe('9.•••.•••-K');
    expect(maskRut('')).toBe('');
  });
  it('correo: deja 2 letras y el dominio', () => {
    expect(maskEmail('u25046021@gmail.com')).toBe('u2•••••••@gmail.com');
    expect(maskEmail('ab@x.cl')).toBe('a•••@x.cl');
  });
  it('teléfono: deja los últimos 4', () => {
    expect(maskPhone('+56965321554')).toBe('+56 9 •••• 1554');
    expect(maskPhone('+56 9 6532 1554')).toBe('+56 9 •••• 1554');
  });
  it('cuenta bancaria: deja los últimos 4', () => {
    expect(maskAccountNumber('000123456789')).toBe('•••• 6789');
  });
});
