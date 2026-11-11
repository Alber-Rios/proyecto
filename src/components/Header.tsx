import React, { useState, useEffect } from 'react';
import { BrandLogo } from './BrandLogo.tsx';
import { UserMenu } from './UserMenu.tsx';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.tsx';
import {
  Wallet,
  Building2,
  ShieldCheck,
  UserCheck,
  Bell,
  CheckCircle2,
  ChevronDown,
  Search,
  FileText,
  Briefcase,
  LogIn,
  UserPlus,
  LogOut,
  User,
  ChevronRight,
  X,
  Clock,
  Check,
  SlidersHorizontal,
  Heart,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';
import { capitalizeInitial, formatRut, getNameInitial } from '../utils/formatters.ts';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string, options?: { replace?: boolean }) => void;
  onOpenOwnerUpgrade: () => void;
  onOpenAuth: (mode: 'login' | 'register', notice?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  onOpenOwnerUpgrade,
  onOpenAuth,
}) => {
  const {
    currentUser,
    allUsers,
    switchUser,
    logout,
    notifications,
    markAllNotificationsRead,
    dismissNotification,
    favoriteSpaceIds,
  } = useApp();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDemoSwitcher, setShowDemoSwitcher] = useState(false);

  const routerNavigate = useNavigate();
  const unreadNotifications = notifications.filter((n) => !n.read);

  // Close menus on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowUserMenu(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getRoleMeta = (role?: string) => {
    if (role === 'admin') {
      return {
        label: 'Admin gobierno',
        shortLabel: 'Admin',
        dotColor: 'bg-indigo-500',
        textColor: 'text-indigo-700',
        badgeBg: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
      };
    }
    if (role === 'owner') {
      return {
        label: 'Propietario',
        shortLabel: 'Propietario',
        dotColor: 'bg-amber-500',
        textColor: 'text-amber-700',
        badgeBg: 'bg-amber-50 text-amber-800 ring-amber-600/20',
      };
    }
    return {
      label: 'Arrendatario',
      shortLabel: 'Arrendatario',
      dotColor: 'bg-emerald-500',
      textColor: 'text-emerald-700',
      badgeBg: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    };
  };

  const roleMeta = getRoleMeta(currentUser?.role);

  const handleMenuNavigate = (view: string) => {
    setShowUserMenu(false);
    onNavigate(view);
  };

  const handleHowItWorks = () => {
    if (currentView !== 'home') {
      onNavigate('home');
      window.setTimeout(() => {
        document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return;
    }
    document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePublish = () => {
    if (!currentUser) {
      onOpenAuth('register', 'Crea tu cuenta para publicar y administrar un espacio.');
      return;
    }
    onOpenOwnerUpgrade();
  };

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-500 ${
        isScrolled
          ? 'bg-white/75 backdrop-blur-xl backdrop-saturate-150 border-stone-200/70 shadow-[0_10px_30px_-18px_rgba(12,10,9,0.25)]'
          : 'bg-stone-50/90 backdrop-blur-md border-transparent'
      }`}
    >
      <div className="max-w-7xl 2xl:max-w-[1536px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between gap-3 transition-[height] duration-500 ${isScrolled ? 'h-14 sm:h-[3.75rem]' : 'h-16 sm:h-[4.5rem]'}`}>
          {/* Logo & Navegación Principal en Tablet/PC */}
          <div className="flex items-center gap-6 lg:gap-8 min-w-0">
            <button
              id="brand-logo-btn"
              onClick={() => onNavigate('home')}
              aria-label="Spotly, ir al inicio"
              className="group flex items-center text-left shrink-0 rounded-md cursor-pointer"
            >
              <BrandLogo animated className="text-[1.6rem] sm:text-[1.85rem] transition-transform duration-500 group-hover:-translate-y-0.5" />
            </button>

            {/* Enlaces rápidos visibles en Tablet (md) y PC (lg) */}
            <nav className="hidden md:flex items-center gap-1">
              {currentUser?.role === 'admin' ? (
                <>
                  <button
                    onClick={() => onNavigate('admin')}
                    className={`whitespace-nowrap px-2.5 lg:px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                      currentView === 'admin'
                        ? 'text-indigo-700 bg-indigo-50/90'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Panel administrador
                  </button>
                  <button
                    onClick={() => onNavigate('home')}
                    className={`whitespace-nowrap px-2.5 lg:px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                      currentView === 'home' || currentView === 'space-detail'
                        ? 'text-slate-900 bg-slate-100/90'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Catálogo público
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onNavigate('home')}
                    className={`whitespace-nowrap px-2.5 lg:px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                      currentView === 'home' || currentView === 'space-detail'
                        ? 'text-slate-900 bg-slate-100/90'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Buscar espacios
                  </button>

                  <button
                    onClick={handleHowItWorks}
                    className="hidden lg:inline-flex whitespace-nowrap px-2.5 lg:px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  >
                    Cómo funciona
                  </button>

                  {currentUser && (
                    <button
                      onClick={() => onNavigate('my-bookings')}
                      className={`whitespace-nowrap px-2.5 lg:px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                        currentView === 'my-bookings'
                          ? 'text-slate-900 bg-slate-100/90'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Mis reservas
                    </button>
                  )}

                  {currentUser && (currentUser.role === 'owner' || currentUser.ownerTermsAccepted) && (
                    <button
                      onClick={() => onNavigate('owner')}
                      className={`whitespace-nowrap px-2.5 lg:px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                        currentView === 'owner'
                          ? 'text-rose-600 bg-rose-50/80'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Mis espacios
                    </button>
                  )}

                  {currentUser && (
                    <button
                      onClick={() => onNavigate('support')}
                      className={`whitespace-nowrap px-2.5 lg:px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                        currentView === 'support'
                          ? 'text-rose-600 bg-rose-50/80'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <span className="lg:hidden">Ayuda</span>
                      <span className="hidden lg:inline">Ayuda y soporte</span>
                    </button>
                  )}
                </>
              )}
            </nav>
          </div>

          {/* Acciones Derecha */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {currentUser?.role !== 'admin' && (
              <button
                type="button"
                onClick={handlePublish}
                className="hidden lg:inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
              >
                <Building2 className="h-4 w-4" /> Publicar
              </button>
            )}
            {/* CASO 1: USUARIO NO REGISTRADO (Visitante) */}
            {!currentUser ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  id="header-login-btn"
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-slate-500" />
                  <span>Iniciar sesión</span>
                </button>

                <button
                  id="header-register-btn"
                  onClick={() => onNavigate('register')}
                  className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition transform active:scale-95 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Registrarte</span>
                </button>
              </div>
            ) : (
              <>
                {/* Campana de Notificaciones */}
                <div className="relative">
                  <button
                    id="notifications-bell-btn"
                    onClick={() => {
                      setShowNotifications(!showNotifications);
                      setShowUserMenu(false);
                    }}
                    className={`relative w-10 h-10 flex items-center justify-center rounded-full border transition cursor-pointer ${
                      showNotifications
                        ? 'bg-slate-100 border-slate-300 text-slate-900'
                        : 'bg-white border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                    aria-label="Notificaciones"
                  >
                    <Bell className="w-[18px] h-[18px]" />
                    {unreadNotifications.length > 0 && (
                      <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-600 rounded-full ring-2 ring-white" />
                    )}
                  </button>

                  {showNotifications && (
                    <>
                      <div
                        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
                        onClick={() => setShowNotifications(false)}
                      />
                      <div className="fixed inset-x-3 top-[4.5rem] w-auto max-h-[calc(100dvh-5.5rem)] bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-3 z-50 flex flex-col sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2.5 sm:w-[22rem] md:w-[24rem]">
                        <div className="flex items-center justify-between gap-2 px-4 pb-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              Notificaciones
                            </span>
                            {unreadNotifications.length > 0 && (
                              <span className="text-xs font-semibold text-rose-600">
                                · {unreadNotifications.length} nuevas
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {unreadNotifications.length > 0 && (
                              <button
                                onClick={markAllNotificationsRead}
                                className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
                              >
                                Marcar leídas
                              </button>
                            )}
                            <button
                              onClick={() => setShowNotifications(false)}
                              className="sm:hidden p-1 text-slate-500 hover:text-slate-600 rounded-lg"
                              aria-label="Cerrar notificaciones"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="max-h-[min(20rem,calc(100dvh-9rem))] overflow-y-auto overscroll-contain divide-y divide-slate-100">
                          {notifications.length === 0 ? (
                            <p className="text-xs text-slate-500 py-8 text-center">
                              No tienes notificaciones pendientes
                            </p>
                          ) : (
                            notifications.map((n) => (
                              <div
                                key={n.id}
                                className={`p-3.5 hover:bg-slate-50/80 transition flex items-start justify-between gap-3 ${
                                  !n.read ? 'bg-rose-50/30' : ''
                                }`}
                              >
                                <div
                                  className={`min-w-0 flex-1 space-y-1 ${n.link ? 'cursor-pointer' : ''}`}
                                  onClick={() => {
                                    if (n.link) {
                                      routerNavigate(n.link);
                                    }
                                  }}
                                >
                                  <p className="break-words text-xs font-semibold text-slate-900">
                                    {n.title}
                                  </p>
                                  <p className="break-words text-xs text-slate-600 leading-relaxed">
                                    {n.message}
                                  </p>
                                  <span className="text-xs text-slate-500 block">
                                    {new Date(n.timestamp).toLocaleString('es-CL', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <button
                                  onClick={() => dismissNotification(n.id)}
                                  className="shrink-0 text-slate-500 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
                                  aria-label="Descartar notificación"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Selector de Perfil (Adaptado para Móvil, Tablet y PC) */}
                <div className="relative">
                  <button
                    id="user-profile-menu-btn"
                    onClick={() => {
                      setShowUserMenu(!showUserMenu);
                      setShowNotifications(false);
                    }}
                    aria-expanded={showUserMenu}
                    className={`flex items-center gap-2 sm:gap-2.5 p-1 sm:pl-3 sm:pr-2 sm:py-1.5 rounded-full border transition cursor-pointer select-none ${
                      showUserMenu
                        ? 'border-slate-300 bg-slate-50 shadow-xs ring-2 ring-slate-900/5'
                        : 'border-slate-200/90 hover:border-slate-300 bg-white hover:bg-slate-50/70 shadow-2xs'
                    }`}
                  >
                    {/* Nombre y rol visibles desde Tablet (sm) y PC */}
                    <div className="text-left hidden sm:block max-w-[120px] md:max-w-[150px]">
                      <div className="text-xs font-bold text-slate-900 leading-tight truncate">
                        {capitalizeInitial(currentUser.fullName.split(' ')[0])}
                      </div>
                      <div className="text-xs leading-tight flex items-center gap-1 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${roleMeta.dotColor}`} />
                        <span className={`font-semibold truncate ${roleMeta.textColor}`}>
                          {roleMeta.shortLabel}
                        </span>
                      </div>
                    </div>

                    {/* Avatar con indicador de verificación */}
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 ring-2 ring-slate-100 overflow-hidden flex items-center justify-center font-bold text-sm">
                        {currentUser.avatarUrl ? (
                          <img src={currentUser.avatarUrl} alt={`Foto de ${currentUser.fullName}`} className="w-full h-full object-cover" />
                        ) : getNameInitial(currentUser.firstNames || currentUser.fullName)}
                      </div>
                      {currentUser.verificationStatus === 'verified' && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 ring-2 ring-white"
                          title="Identidad Verificada"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>

                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-500 mr-1 sm:mr-0 transition-transform duration-200 ${
                        showUserMenu ? 'rotate-180 text-slate-700' : ''
                      }`}
                    />
                  </button>

                  <UserMenu
                    open={showUserMenu}
                    currentView={currentView}
                    onClose={() => setShowUserMenu(false)}
                    onNavigate={onNavigate}
                    onOpenOwnerUpgrade={onOpenOwnerUpgrade}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

