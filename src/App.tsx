import React, { lazy, Suspense, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Header } from './components/Header.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { Space } from './types.ts';
import { Building2 } from 'lucide-react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { PageTransition, ScrollProgress } from './components/motion/Motion.tsx';
import { CookieBanner } from './components/CookieBanner.tsx';

// Las páginas se cargan bajo demanda para que la portada descargue solo lo que necesita.
const SpaceDetailPage = lazy(() => import('./pages/SpaceDetailPage.tsx').then((m) => ({ default: m.SpaceDetailPage })));
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
    
    navigate(routes[view] || '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectSpace = (space: Space) => {
    setSelectedSpace(space);
    navigate(`/space/${space.id}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Extract current view string from location for Header compatibility
  const currentViewString = location.pathname === '/' ? 'home' 
    : location.pathname.startsWith('/space') ? 'space-detail'
    : location.pathname.slice(1);
  const canAccessOwnerDashboard = currentUser?.role === 'admin'
    || currentUser?.role === 'owner'
    || Boolean(currentUser?.ownerTermsAccepted);

  return (
    <div className="min-h-screen bg-stone-50 text-slate-800 flex flex-col font-sans antialiased selection:bg-rose-500 selection:text-white">
      <ScrollProgress />
      {/* Header Principal */}
      <Header
        currentView={currentViewString as any}
        onNavigate={handleNavigate}
        onOpenOwnerUpgrade={handleOpenOwnerUpgrade}
        onOpenAuth={handleOpenAuth}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl 2xl:max-w-[1536px] w-full mx-auto px-3 sm:px-5 lg:px-8 pt-3 sm:pt-5 pb-8 sm:pb-10 min-w-0 overflow-x-hidden">
        <Suspense fallback={<div className="min-h-[100vh] py-24 text-center text-sm text-slate-500" role="status">Cargando…</div>}>
        <AnimatePresence mode="wait" initial={false}>
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
        </AnimatePresence>
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

      {/* Footer Institucional Chileno */}
      <footer className="bg-slate-900 text-slate-400 text-sm mt-16 border-t border-slate-800">
        <div className="max-w-7xl 2xl:max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center text-white">
                  <Building2 className="w-4 h-4" />
                </div>
                <span className="text-white font-bold text-base tracking-tight">
                  Spotly
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed text-sm">
                Una plataforma para encontrar y publicar espacios con modalidades de arriendo flexibles. Revisa los detalles y condiciones de cada publicación.
              </p>
            </div>

            <div>
              <h2 className="text-white text-sm font-semibold mb-3">Encuentra un espacio</h2>
              <p className="text-sm leading-relaxed mb-3">Explora las publicaciones disponibles y revisa sus precios, ubicación y condiciones.</p>
              <button type="button" onClick={() => handleNavigate('home')} className="text-rose-300 hover:text-white font-semibold transition">
                Ir al catálogo
              </button>
            </div>

            <div>
              <h2 className="text-white text-sm font-semibold mb-3">Publica tu espacio</h2>
              <p className="text-sm leading-relaxed mb-3">Administra tus publicaciones y solicitudes desde el panel de propietario.</p>
              <button type="button" onClick={handleOpenOwnerUpgrade} className="text-rose-300 hover:text-white font-semibold transition">
                Comenzar a publicar
              </button>
            </div>

            <div>
              <h2 className="text-white text-sm font-semibold mb-3">¿Necesitas ayuda?</h2>
              <p className="text-sm leading-relaxed mb-3">Encuentra orientación para tu cuenta, publicaciones y reservas.</p>
              <button type="button" onClick={() => handleNavigate('support')} className="text-rose-300 hover:text-white font-semibold transition">
                Ir a ayuda y soporte
              </button>
            </div>

            <div>
              <h2 className="text-white text-sm font-semibold mb-3">Información legal</h2>
              <ul className="space-y-1 text-sm">
                {[
                  ['/aviso-legal', 'Aviso legal'],
                  ['/terminos', 'Términos y condiciones'],
                  ['/privacidad', 'Política de privacidad'],
                  ['/cookies', 'Política de cookies'],
                  ['/mapa-del-sitio', 'Mapa del sitio'],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link to={href} onClick={() => window.scrollTo({ top: 0 })} className="inline-block py-1.5 text-slate-400 hover:text-white transition">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-400">
            <span>© {new Date().getFullYear()} Spotly.</span>
            <span>La disponibilidad y las condiciones dependen de cada publicación.</span>
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
