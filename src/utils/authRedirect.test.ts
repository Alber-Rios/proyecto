import { describe, expect, it } from 'vitest';
import { authReturnPath, isAuthPath } from './authRedirect.ts';

describe('vuelta después de iniciar sesión', () => {
  it('vuelve a la página de origen', () => {
    expect(authReturnPath({ from: '/space/sp-1' })).toBe('/space/sp-1');
    expect(authReturnPath({ from: '/my-bookings?reserva=r-1' })).toBe('/my-bookings?reserva=r-1');
  });
  it('sin origen va al inicio', () => {
    expect(authReturnPath(null)).toBe('/');
    expect(authReturnPath({})).toBe('/');
  });
  it('nunca vuelve a otra página de acceso ni sale del sitio', () => {
    expect(authReturnPath({ from: '/login' })).toBe('/');
    expect(authReturnPath({ from: '/register?x=1' })).toBe('/');
    expect(authReturnPath({ from: 'https://otro.sitio' })).toBe('/');
    expect(authReturnPath({ from: '//otro.sitio' })).toBe('/');
  });
  it('reconoce las rutas de acceso', () => {
    expect(isAuthPath('/login')).toBe(true);
    expect(isAuthPath('/forgot-password')).toBe(true);
    expect(isAuthPath('/owner')).toBe(false);
  });
});
