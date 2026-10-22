import React, { lazy, Suspense, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Header } from './components/Header.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { Space } from './types.ts';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { PageTransition } from './components/motion/Motion.tsx';
import { runViewTransition } from './lib/viewTransition.ts';
import { CookieBanner } from './components/CookieBanner.tsx';

// Las páginas se cargan bajo demanda para que la portada descargue solo lo que necesita.
const loadSpaceDetail = () => import('./pages/SpaceDetailPage.tsx');
const SpaceDetailPage = lazy(() => loadSpaceDetail().then((m) => ({ default: m.SpaceDetailPage })));
const LoginPage = lazy(() => import('./pages/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage.tsx').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.tsx').then((m) => ({ default: m.ForgotPasswordPage })));
const OwnerDashboardPage = lazy(() => import('./pages/OwnerDashboardPage.tsx').then((m) => ({ default: m.OwnerDashboardPage })));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage.tsx').then((m) => ({ default: m.AdminDashboardPage })));
const TenantReservationsPage = lazy(() => import('./pages/TenantReservationsPage.tsx').then((m) => ({ default: m.TenantReservationsPage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.tsx').then((m) => ({ default: m.OnboardingPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage.tsx').then((m) => ({ default: m.FavoritesPage })));
const SupportPage = lazy(() => import('./pages/SupportPage.tsx').then((m) => ({ default: m.SupportPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.tsx').then((m) => ({ default: m.NotFoundPage })));
const LegalPage = lazy(() => import('./pages/LegalPage.tsx').then((m) => ({ default: m.LegalPage })));
const OwnerUpgradeModal = lazy(() => import('./components/OwnerUpgradeModal.tsx').then((m) => ({ default: m.OwnerUpgradeModal })));
const WalletPage = lazy(() => import('./pages/WalletPage.tsx').then((m) => ({ default: m.WalletPage })));
const SiteMapPage = lazy(() => import('./pages/SiteMapPage.tsx').then((m) => ({ default: m.SiteMapPage })));

function AppContent() {
  const { currentUser, spaces } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [isOwnerUpgradeModalOpen, setIsOwnerUpgradeModalOpen] = useState(false);
  
  const handleOpenAuth = (mode: 'login' | 'register', notice?: string) => {
    if (mode === 'login') {
      navigate('/login', { state: { notice } });
    } else {
      navigate('/register', { state: { notice } });
    }
  };

  const handleOpenOwnerUpgrade = () => {
    if (!currentUser) {
      handleOpenAuth('login', 'Inicia sesión para acceder a las funciones de propietario.');
      return;
    }
    if (currentUser.role === 'owner' || currentUser.ownerTermsAccepted) {
      // "Publicar" lleva directo al formulario de publicación del panel.
      navigate('/owner', { state: { openPublish: true } });
      return;
    }
    setIsOwnerUpgradeModalOpen(true);
  };

  const handleNavigate = (view: string) => {
    if (view === 'owner' && currentUser && currentUser.role === 'tenant' && !currentUser.ownerTermsAccepted) {
      setIsOwnerUpgradeModalOpen(true);
      return;
    }
    
    // Map view string to route
    const routes: Record<string, string> = {
      'home': '/',
      'space-detail': '/space',
      'favorites': '/favorites',
      'login': '/login',
      'register': '/register',
      'forgot-password': '/forgot-password',
      'my-bookings': '/my-bookings',
      'tenant-reservations': '/my-bookings',
      'owner': '/owner',
      'admin': '/admin',
      'onboarding': '/onboarding',
      'profile': '/profile',
      'support': '/support',
      'terms': '/terminos',
      'privacy': '/privacidad',
      'cookies': '/cookies',
      'legal-notice': '/aviso-legal',
      'sitemap': '/mapa-del-sitio',
      'wallet': '/billetera'
    };
    
    runViewTransition(() => {
      navigate(routes[view] || '/');
      window.scrollTo({ top: 0 });
    });
  };

  // La foto de la tarjeta se transforma en la portada de la ficha (View Transitions).
  const handleSelectSpace = (space: Space) => {
    runViewTransition(() => {
      setSelectedSpace(space);
      navigate(`/space/${space.id}`);
      window.scrollTo({ top: 0 });
    }, loadSpaceDetail);
  };

  // Extract current view string from location for Header compatibility
  const currentViewString = location.pathname === '/' ? 'home' 
    : location.pathname.startsWith('/space') ? 'space-detail'
    : location.pathname.slice(1);
  const canAccessOwnerDashboard = currentUser?.role === 'admin'
    || currentUser?.role === 'owner'
    || Boolean(currentUser?.ownerTermsAccepted);

  return (
    <div className="min-h-screen bg-white text-slate-800 flex flex-col font-sans antialiased">
      {/* Header Principal */}
      <Header
        currentView={currentViewString as any}
        onNavigate={handleNavigate}
        onOpenOwnerUpgrade={handleOpenOwnerUpgrade}
        onOpenAuth={handleOpenAuth}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl 2xl:max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-10 pt-3 sm:pt-5 pb-12 sm:pb-16 min-w-0 overflow-x-hidden">
        <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center" role="status" aria-label="Cargando"><span className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" /></div>}>
        <PageTransition key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={
            <HomePage
              onOpenOwnerUpgrade={handleOpenOwnerUpgrade}
              onNavigate={handleNavigate}
              onOpenAuth={handleOpenAuth}
              onSelectSpace={handleSelectSpace}
            />
          } />
          
          <Route path="/space/:id" element={
            <SpaceDetailPage
              space={selectedSpace || spaces[0]}
              onNavigate={handleNavigate}
              onOpenAuth={handleOpenAuth}
            />
          } />
          
          <Route path="/space" element={
            <SpaceDetailPage
              space={selectedSpace || spaces[0]}
              onNavigate={handleNavigate}
              onOpenAuth={handleOpenAuth}
            />
          } />

          <Route path="/login" element={<LoginPage onNavigate={handleNavigate} />} />
          <Route path="/register" element={<RegisterPage onNavigate={handleNavigate} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage onNavigate={handleNavigate} />} />

          <Route path="/favorites" element={
            <FavoritesPage
              onNavigate={handleNavigate}
              onSelectSpace={handleSelectSpace}
            />
          } />

          <Route path="/my-bookings" element={
            <TenantReservationsPage
              onNavigate={handleNavigate}
              onOpenOwnerUpgrade={handleOpenOwnerUpgrade}
              onOpenAuth={handleOpenAuth}
            />
          } />

          <Route path="/owner" element={canAccessOwnerDashboard ? (
              <OwnerDashboardPage
                onOpenOwnerUpgrade={handleOpenOwnerUpgrade}
                onNavigate={handleNavigate}
                onOpenAuth={handleOpenAuth}
              />
            ) : (
              <NotFoundPage onNavigate={handleNavigate} showLogin={!currentUser} restricted />
            )} />

          <Route path="/admin" element={currentUser?.role === 'admin'
            ? <AdminDashboardPage onOpenAuth={handleOpenAuth} />
            : <NotFoundPage onNavigate={handleNavigate} showLogin={!currentUser} restricted />
          } />

          <Route path="/onboarding" element={
            <OnboardingPage
              onNavigate={handleNavigate}
              onOpenAuth={handleOpenAuth}
            />
          } />

          <Route path="/profile" element={
            <ProfilePage
              onNavigate={handleNavigate}
              onOpenOwnerUpgrade={handleOpenOwnerUpgrade}
              onOpenAuth={handleOpenAuth}
            />
          } />

          <Route path="/support" element={
            <SupportPage
              onNavigate={handleNavigate}
              onOpenAuth={handleOpenAuth}
            />
          } />

          <Route path="/billetera" element={<WalletPage onOpenAuth={handleOpenAuth} />} />
          <Route path="/aviso-legal" element={<LegalPage document="notice" />} />
          <Route path="/mapa-del-sitio" element={<SiteMapPage />} />
          <Route path="/terminos" element={<LegalPage document="terms" />} />
          <Route path="/privacidad" element={<LegalPage document="privacy" />} />
          <Route path="/cookies" element={<LegalPage document="cookies" />} />

          <Route path="*" element={<NotFoundPage onNavigate={handleNavigate} showLogin={!currentUser} />} />
        </Routes>
        </PageTransition>
        </Suspense>
      </main>

      {/* Modal de Conversión de Arrendatario a Propietario (Aceptación de Términos) */}
      <Suspense fallback={null}>
        {isOwnerUpgradeModalOpen && (
          <OwnerUpgradeModal
            isOpen={isOwnerUpgradeModalOpen}
            onClose={() => setIsOwnerUpgradeModalOpen(false)}
            onSuccessNavigate={() => {
              navigate('/owner', { state: { openPublish: true } });
            }}
          />
        )}
      </Suspense>

      {/* Pie de página */}
      <footer className="mt-20 bg-slate-50 border-t border-slate-200/80 text-sm">
        <div className="max-w-7xl 2xl:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 pt-12 pb-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="col-span-2 md:col-span-1 space-y-3 max-w-xs">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-[650] tracking-[-0.045em] text-slate-950">Spotly</span>
                <span className="h-[6px] w-[6px] -ml-1 rounded-full bg-brand-600" aria-hidden="true" />
              </div>
              <p className="text-slate-500 leading-relaxed">
                Espacios para trabajar, crear, reunirte o descansar en todo Chile. Por hora, día o mes, con contrato y pago protegido.
              </p>
            </div>

            <nav aria-label="Arrendar" className="space-y-3">
              <h2 className="font-semibold text-slate-900">Arrendar</h2>
              <ul className="space-y-2 text-slate-600">
                <li><button type="button" onClick={() => handleNavigate('home')} className="hover:text-slate-950 hover:underline cursor-pointer">Buscar espacios</button></li>
                {currentUser && <li><button type="button" onClick={() => handleNavigate('my-bookings')} className="hover:text-slate-950 hover:underline cursor-pointer">Mis reservas</button></li>}
                {currentUser && <li><button type="button" onClick={() => handleNavigate('favorites')} className="hover:text-slate-950 hover:underline cursor-pointer">Favoritos</button></li>}
                <li><button type="button" onClick={() => handleNavigate('support')} className="hover:text-slate-950 hover:underline cursor-pointer">Ayuda y soporte</button></li>
              </ul>
            </nav>

            <nav aria-label="Publicar" className="space-y-3">
              <h2 className="font-semibold text-slate-900">Publicar</h2>
              <ul className="space-y-2 text-slate-600">
                <li><button type="button" onClick={handleOpenOwnerUpgrade} className="hover:text-slate-950 hover:underline cursor-pointer">Publica tu espacio</button></li>
                {canAccessOwnerDashboard && <li><button type="button" onClick={() => handleNavigate('owner')} className="hover:text-slate-950 hover:underline cursor-pointer">Panel de propietario</button></li>}
              </ul>
            </nav>

            <nav aria-label="Información legal" className="space-y-3">
              <h2 className="font-semibold text-slate-900">Legal</h2>
              <ul className="space-y-2 text-slate-600">
                {[
                  ['/aviso-legal', 'Aviso legal'],
                  ['/terminos', 'Términos y condiciones'],
                  ['/privacidad', 'Privacidad'],
                  ['/cookies', 'Cookies'],
                  ['/mapa-del-sitio', 'Mapa del sitio'],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link to={href} onClick={() => window.scrollTo({ top: 0 })} className="hover:text-slate-950 hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px] text-slate-500">
            <span>© {new Date().getFullYear()} Spotly · Hecho en Chile</span>
            <span>Precios en pesos chilenos (CLP) · Hora de Chile continental</span>
          </div>
        </div>
      </footer>

      <CookieBanner />
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
export default App;
