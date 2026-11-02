import { describe, expect, it } from 'vitest';
import { formatRutInput, validateRut } from './formatters.ts';

describe('formatRutInput (RUT mientras se escribe)', () => {
  it('agrega puntos y guion', () => {
    expect(formatRutInput('123243245')).toBe('12.324.324-5');
    expect(formatRutInput('12345678K')).toBe('12.345.678-K');
    expect(formatRutInput('9876543k')).toBe('9.876.543-K');
  });

  it('acepta lo que ya viene formateado o pegado con espacios', () => {
    expect(formatRutInput('12.324.324-5')).toBe('12.324.324-5');
    expect(formatRutInput(' 12 324 324 5 ')).toBe('12.324.324-5');
  });

  it('va formateando a medida que se escribe', () => {
    expect(formatRutInput('1')).toBe('1');
    expect(formatRutInput('12')).toBe('1-2');
    expect(formatRutInput('1234')).toBe('123-4');
    expect(formatRutInput('12345')).toBe('1.234-5');
  });

  it('la K solo vale al final y no pasa de 9 caracteres', () => {
    expect(formatRutInput('12K45678')).toBe('124.567-8');
    expect(formatRutInput('1234567890')).toBe('12.345.678-9');
  });

  it('el resultado formateado se valida igual que sin formato', () => {
    expect(validateRut(formatRutInput('123456785'))).toBe(true);
    expect(validateRut(formatRutInput('123456789'))).toBe(false);
  });
});
