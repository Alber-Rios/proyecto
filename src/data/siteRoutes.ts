// Páginas públicas del sitio. Alimenta el mapa del sitio visible y sitemap.xml.
export interface PublicRoute {
  path: string;
  label: string;
  group: 'Explorar' | 'Cuenta' | 'Ayuda' | 'Legal';
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', label: 'Inicio y catálogo de espacios', group: 'Explorar' },
  { path: '/verificar-contrato', label: 'Verificar un contrato', group: 'Explorar' },
  { path: '/login', label: 'Iniciar sesión', group: 'Cuenta' },
  { path: '/register', label: 'Crear cuenta', group: 'Cuenta' },
  { path: '/forgot-password', label: 'Recuperar contraseña', group: 'Cuenta' },
  { path: '/support', label: 'Ayuda y soporte', group: 'Ayuda' },
  { path: '/mapa-del-sitio', label: 'Mapa del sitio', group: 'Ayuda' },
  { path: '/aviso-legal', label: 'Aviso legal', group: 'Legal' },
  { path: '/terminos', label: 'Términos y condiciones', group: 'Legal' },
  { path: '/privacidad', label: 'Política de privacidad', group: 'Legal' },
  { path: '/cookies', label: 'Política de cookies', group: 'Legal' },
];
