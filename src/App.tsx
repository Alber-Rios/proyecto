import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Header } from './components/Header.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { SpaceDetailPage } from './pages/SpaceDetailPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.tsx';
import { OwnerDashboardPage } from './pages/OwnerDashboardPage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { TenantReservationsPage } from './pages/TenantReservationsPage.tsx';
import { OnboardingPage } from './pages/OnboardingPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { FavoritesPage } from './pages/FavoritesPage.tsx';
import { SupportPage } from './pages/SupportPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { LegalPage } from './pages/LegalPage.tsx';
import { OwnerUpgradeModal } from './components/OwnerUpgradeModal.tsx';
import { Space } from './types.ts';
import { Building2 } from 'lucide-react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

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
      navigate('/owner');
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
      'cookies': '/cookies'
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff_0%,_#f8fafc_44%,_#eef2ff_100%)] text-slate-800 flex flex-col font-sans antialiased selection:bg-rose-500 selection:text-white">
      {/* Header Principal */}
      <Header
        currentView={currentViewString as any}
        onNavigate={handleNavigate}
        onOpenOwnerUpgrade={handleOpenOwnerUpgrade}
        onOpenAuth={handleOpenAuth}
      />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-5 lg:px-8 pt-3 sm:pt-5 pb-8 sm:pb-10 min-w-0 overflow-x-hidden">
        <Routes>
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

          <Route path="/terminos" element={<LegalPage document="terms" />} />
          <Route path="/privacidad" element={<LegalPage document="privacy" />} />
          <Route path="/cookies" element={<LegalPage document="cookies" />} />

          <Route path="*" element={<NotFoundPage onNavigate={handleNavigate} showLogin={!currentUser} />} />
        </Routes>
      </main>

      {/* Modal de Conversión de Arrendatario a Propietario (Aceptación de Términos) */}
      <OwnerUpgradeModal
        isOpen={isOwnerUpgradeModalOpen}
        onClose={() => setIsOwnerUpgradeModalOpen(false)}
        onSuccessNavigate={() => {
          navigate('/owner');
        }}
      />

      {/* Footer Institucional Chileno */}
      <footer className="bg-slate-900 text-slate-400 text-xs mt-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
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
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Una plataforma para encontrar y publicar espacios con modalidades de arriendo flexibles. Revisa los detalles y condiciones de cada publicación.
              </p>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">Encuentra un espacio</h4>
              <p className="text-[11px] leading-relaxed mb-3">Explora las publicaciones disponibles y revisa sus precios, ubicación y condiciones.</p>
              <button type="button" onClick={() => handleNavigate('home')} className="text-rose-300 hover:text-white font-semibold transition">
                Ir al catálogo
              </button>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">Publica tu espacio</h4>
              <p className="text-[11px] leading-relaxed mb-3">Administra tus publicaciones y solicitudes desde el panel de propietario.</p>
              <button type="button" onClick={handleOpenOwnerUpgrade} className="text-rose-300 hover:text-white font-semibold transition">
                Comenzar a publicar
              </button>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">¿Necesitas ayuda?</h4>
              <p className="text-[11px] leading-relaxed mb-3">Encuentra orientación para tu cuenta, publicaciones y reservas.</p>
              <button type="button" onClick={() => handleNavigate('support')} className="text-rose-300 hover:text-white font-semibold transition">
                Ir a ayuda y soporte
              </button>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3">Información legal</h4>
              <ul className="space-y-2 text-[11px]">
                <li><button type="button" onClick={() => handleNavigate('terms')} className="text-slate-400 hover:text-white transition">Términos y condiciones</button></li>
                <li><button type="button" onClick={() => handleNavigate('privacy')} className="text-slate-400 hover:text-white transition">Política de privacidad</button></li>
                <li><button type="button" onClick={() => handleNavigate('cookies')} className="text-slate-400 hover:text-white transition">Política de cookies</button></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>© {new Date().getFullYear()} Spotly.</span>
            <span>La disponibilidad y las condiciones dependen de cada publicación.</span>
          </div>
        </div>
      </footer>
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
