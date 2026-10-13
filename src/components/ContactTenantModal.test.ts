import { describe, expect, it } from 'vitest';
import { toWhatsAppNumber } from './ContactTenantModal.tsx';

describe('toWhatsAppNumber', () => {
  it('agrega el código de Chile a un móvil de 9 dígitos', () => {
    expect(toWhatsAppNumber('9 1234 5678')).toBe('56912345678');
  });

  it('mantiene un número que ya trae código de país', () => {
    expect(toWhatsAppNumber('+56 9 1234 5678')).toBe('56912345678');
  });

  it('devuelve vacío si no hay teléfono', () => {
    expect(toWhatsAppNumber('')).toBe('');
  });
});
