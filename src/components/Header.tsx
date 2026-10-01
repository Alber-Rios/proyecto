import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  Building2,
  ShieldCheck,
  UserCheck,
  Bell,
  CheckCircle2,
  ChevronDown,
  Sparkles,
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
import { formatRut, getNameInitial } from '../utils/formatters.ts';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenOwnerUpgrade: () => void;
  onOpenAuth: (mode: 'login' | 'register', notice?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  onOpenOwnerUpgrade,
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDemoSwitcher, setShowDemoSwitcher] = useState(false);

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
        label: 'Admin Gobierno',
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

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-[4.25rem] gap-3">
          {/* Logo & Navegación Principal en Tablet/PC */}
          <div className="flex items-center gap-6 lg:gap-8 min-w-0">
            <button
              id="brand-logo-btn"
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2.5 text-left group transition shrink-0 focus:outline-none"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 flex items-center justify-center text-white shadow-sm shadow-rose-500/20 group-hover:scale-105 transition-transform">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 block leading-none">
                  Spotly
                </span>
                <span className="text-[10px] font-semibold text-slate-500 tracking-wider uppercase block mt-0.5">
                  Espacios Chile
                </span>
              </div>
            </button>

            {/* Enlaces rápidos visibles en Tablet (md) y PC (lg) */}
            <nav className="hidden md:flex items-center gap-1">
              {currentUser?.role === 'admin' ? (
                <>
                  <button
                    onClick={() => onNavigate('admin')}
                    className={`px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                      currentView === 'admin'
                        ? 'text-indigo-700 bg-indigo-50/90'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Panel Administrador
                  </button>
                  <button
                    onClick={() => onNavigate('home')}
                    className={`px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                      currentView === 'home' || currentView === 'space-detail'
                        ? 'text-slate-900 bg-slate-100/90'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Catálogo Público
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onNavigate('home')}
                    className={`px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                      currentView === 'home' || currentView === 'space-detail'
                        ? 'text-slate-900 bg-slate-100/90'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Explorar Espacios
                  </button>

                  {currentUser && (
                    <button
                      onClick={() => onNavigate('my-bookings')}
                      className={`px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                        currentView === 'my-bookings'
                          ? 'text-slate-900 bg-slate-100/90'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Mis Reservas
                    </button>
                  )}

                  {currentUser && (currentUser.role === 'owner' || currentUser.ownerTermsAccepted) && (
                    <button
                      onClick={() => onNavigate('owner')}
                      className={`px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                        currentView === 'owner'
                          ? 'text-rose-600 bg-rose-50/80'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Panel Propietario
                    </button>
                  )}

                  {currentUser && (
                    <button
                      onClick={() => onNavigate('support')}
                      className={`px-3.5 py-2 rounded-xl text-xs lg:text-sm font-semibold transition cursor-pointer ${
                        currentView === 'support'
                          ? 'text-rose-600 bg-rose-50/80'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Ayuda y Soporte
                    </button>
                  )}
                </>
              )}
            </nav>
          </div>

          {/* Acciones Derecha */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* CASO 1: USUARIO NO REGISTRADO (Visitante) */}
            {!currentUser ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  id="header-login-btn"
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-slate-500" />
                  <span>Iniciar Sesión</span>
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
                              className="sm:hidden p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                              aria-label="Cerrar notificaciones"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="max-h-[min(20rem,calc(100dvh-9rem))] overflow-y-auto overscroll-contain divide-y divide-slate-100">
                          {notifications.length === 0 ? (
                            <p className="text-xs text-slate-400 py-8 text-center">
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
                                <div className="min-w-0 flex-1 space-y-1">
                                  <p className="break-words text-xs font-semibold text-slate-900">
                                    {n.title}
                                  </p>
                                  <p className="break-words text-xs text-slate-600 leading-relaxed">
                                    {n.message}
                                  </p>
                                  <span className="text-[11px] text-slate-400 block">
                                    {new Date(n.timestamp).toLocaleTimeString('es-CL', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <button
                                  onClick={() => dismissNotification(n.id)}
                                  className="shrink-0 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
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
                        {currentUser.fullName.split(' ')[0]}
                      </div>
                      <div className="text-[11px] leading-tight flex items-center gap-1 mt-0.5">
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
                      className={`w-3.5 h-3.5 text-slate-400 mr-1 sm:mr-0 transition-transform duration-200 ${
                        showUserMenu ? 'rotate-180 text-slate-700' : ''
                      }`}
                    />
                  </button>

                  {/* Menú Desplegable Responsivo: Panel Flotante en Móvil / Popover en Tablet y PC */}
                  {showUserMenu && (
                    <>
                      {/* Backdrop con ligero desenfoque en móvil para separar del contenido */}
                      <div
                        className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
                        onClick={() => setShowUserMenu(false)}
                      />

                      <div
                        role="menu"
                        aria-orientation="vertical"
                        className="fixed inset-x-3 top-[4.5rem] z-50 max-h-[calc(100dvh-5.25rem)] flex flex-col bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,23,42,0.22)] border border-slate-200/90 overflow-hidden sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2.5 sm:w-[21.5rem] md:w-[23rem]"
                      >
                        {/* Contenedor con scroll interno seguro para pantallas pequeñas o modo horizontal */}
                        <div className="overflow-y-auto overscroll-contain divide-y divide-slate-100">
                          {/* 1. Cabecera de Perfil */}
                          <div className="p-4 sm:px-5 sm:py-4 bg-gradient-to-b from-slate-50/90 to-white">
                            <div className="flex items-center gap-3.5">
                              <div className="relative shrink-0">
                                <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-rose-100 text-rose-700 ring-2 ring-white shadow-sm overflow-hidden flex items-center justify-center font-bold text-xl">
                                  {currentUser.avatarUrl ? (
                                    <img src={currentUser.avatarUrl} alt={`Foto de ${currentUser.fullName}`} className="w-full h-full object-cover" />
                                  ) : getNameInitial(currentUser.firstNames || currentUser.fullName)}
                                </div>
                                {currentUser.verificationStatus === 'verified' && (
                                  <span
                                    className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 ring-2 ring-white shadow-2xs"
                                    title="KYC Verificado"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm sm:text-[15px] font-bold text-slate-900 truncate">
                                    {currentUser.fullName}
                                  </p>
                                  <button
                                    onClick={() => setShowUserMenu(false)}
                                    className="sm:hidden -mr-1 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                                    aria-label="Cerrar menú"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>

                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                  {roleMeta.label}
                                  {currentUser.rut ? ` · RUT ${formatRut(currentUser.rut)}` : ''}
                                </p>

                                <button
                                  onClick={() => handleMenuNavigate('profile')}
                                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold mt-1.5 group cursor-pointer"
                                >
                                  <span>Mi perfil y cuenta</span>
                                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* 2. Tarjeta de Acción Principal (Propietario / Publicar / Admin) */}
                          <div className="p-2.5 sm:p-3 bg-white">
                            {currentUser.role === 'admin' ? (
                              <button
                                onClick={() => handleMenuNavigate('admin')}
                                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition group cursor-pointer text-left"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                                    <ShieldCheck className="w-4 h-4 text-indigo-100" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="block text-xs sm:text-sm font-bold leading-snug truncate">
                                      Panel Administrador
                                    </span>
                                    <span className="block text-[11px] text-indigo-100 truncate">
                                      Comparación KYC, certificados y moderación
                                    </span>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 shrink-0 text-white/80 group-hover:translate-x-0.5 transition-transform" />
                              </button>
                            ) : currentUser.role === 'tenant' && !currentUser.ownerTermsAccepted ? (
                              <button
                                onClick={() => {
                                  setShowUserMenu(false);
                                  onOpenOwnerUpgrade();
                                }}
                                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-700 hover:to-amber-600 text-white shadow-sm transition group cursor-pointer text-left"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
                                    <Sparkles className="w-4 h-4 text-amber-100" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="block text-xs sm:text-sm font-bold leading-snug truncate">
                                      Publica tu espacio en Spotly
                                    </span>
                                    <span className="block text-[11px] text-rose-100 truncate">
                                      Activa tu cuenta de propietario
                                    </span>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 shrink-0 text-white/80 group-hover:translate-x-0.5 transition-transform" />
                              </button>
                            ) : currentUser.role === 'owner' || currentUser.ownerTermsAccepted ? (
                              <button
                                onClick={() => handleMenuNavigate('owner')}
                                className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl transition group cursor-pointer text-left ${
                                  currentView === 'owner'
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-700 hover:to-amber-600 text-white shadow-sm'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0">
                                    <Briefcase className="w-4 h-4 text-white" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="block text-xs sm:text-sm font-bold leading-snug truncate">
                                      Panel Propietario
                                    </span>
                                    <span className="block text-[11px] text-white/85 truncate">
                                      Gestiona espacios, reservas e ingresos
                                    </span>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 shrink-0 text-white/80 group-hover:translate-x-0.5 transition-transform" />
                              </button>
                            ) : null}
                          </div>

                          {/* 3. Navegación Principal según Rol */}
                          {currentUser.role === 'admin' ? (
                            <div className="p-2 space-y-0.5">
                              <button
                                onClick={() => handleMenuNavigate(' home'.trim())}
                                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition group cursor-pointer ${
                                  currentView === 'home' || currentView === 'space-detail'
                                    ? 'bg-indigo-50/70 text-indigo-900'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${
                                    currentView === 'home' || currentView === 'space-detail'
                                      ? 'bg-indigo-100 text-indigo-600'
                                      : 'bg-slate-100/80 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                                  }`}
                                >
                                  <Search className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <span className="block text-sm font-semibold text-slate-800 group-hover:text-slate-900 truncate">
                                    Catálogo Público
                                  </span>
                                  <span className="block text-[11px] text-slate-400 truncate">
                                    Supervisar recintos publicados en plataforma
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
                              </button>
                            </div>
                          ) : (
                            <div className="p-2 space-y-0.5">
                              <button
                                onClick={() => handleMenuNavigate('home')}
                                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition group cursor-pointer ${
                                  currentView === 'home' || currentView === 'space-detail'
                                    ? 'bg-rose-50/70 text-rose-900'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${
                                    currentView === 'home' || currentView === 'space-detail'
                                      ? 'bg-rose-100 text-rose-600'
                                      : 'bg-slate-100/80 text-slate-500 group-hover:bg-rose-50 group-hover:text-rose-600'
                                  }`}
                                >
                                  <Search className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <span className="block text-sm font-semibold text-slate-800 group-hover:text-slate-900 truncate">
                                    Explorar Espacios
                                  </span>
                                  <span className="block text-[11px] text-slate-400 truncate">
                                    Catálogo de oficinas, estudios y salas
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
                              </button>

                              <button
                                onClick={() => handleMenuNavigate('favorites')}
                                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition group cursor-pointer ${
                                  currentView === 'favorites'
                                    ? 'bg-rose-50/70 text-rose-900'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${
                                    currentView === 'favorites'
                                      ? 'bg-rose-100 text-rose-600'
                                      : 'bg-slate-100/80 text-slate-500 group-hover:bg-rose-50 group-hover:text-rose-600'
                                  }`}
                                >
                                  <Heart
                                    className={`w-4 h-4 ${
                                      favoriteSpaceIds.length > 0 ? 'fill-rose-500 text-rose-500' : ''
                                    }`}
                                  />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-900 truncate">
                                      Mis Favoritos
                                    </span>
                                    {favoriteSpaceIds.length > 0 && (
                                      <span className="text-xs font-bold text-rose-600 tabular-nums">
                                        · {favoriteSpaceIds.length}
                                      </span>
                                    )}
                                  </div>
                                  <span className="block text-[11px] text-slate-400 truncate">
                                    Lugares guardados para comparar y reservar
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
                              </button>

                              <button
                                onClick={() => handleMenuNavigate('my-bookings')}
                                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition group cursor-pointer ${
                                  currentView === 'my-bookings'
                                    ? 'bg-rose-50/70 text-rose-900'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${
                                    currentView === 'my-bookings'
                                      ? 'bg-rose-100 text-rose-600'
                                      : 'bg-slate-100/80 text-slate-500 group-hover:bg-rose-50 group-hover:text-rose-600'
                                  }`}
                                >
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <span className="block text-sm font-semibold text-slate-800 group-hover:text-slate-900 truncate">
                                    Mis Reservas
                                  </span>
                                  <span className="block text-[11px] text-slate-400 truncate">
                                    Arriendos activos y contratos digitales
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
                              </button>

                              <button
                                onClick={() => handleMenuNavigate('onboarding')}
                                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition group cursor-pointer ${
                                  currentView === 'onboarding'
                                    ? 'bg-emerald-50/70 text-emerald-900'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${
                                    currentUser.verificationStatus === 'verified'
                                      ? 'bg-emerald-50 text-emerald-600'
                                      : currentUser.verificationStatus === 'rejected'
                                      ? 'bg-rose-50 text-rose-600'
                                      : currentUser.verificationStatus === 'pending_review'
                                      ? 'bg-amber-50 text-amber-600'
                                      : 'bg-slate-100/80 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-600'
                                  }`}
                                >
                                  {currentUser.verificationStatus === 'pending_review' ? (
                                    <Clock className="w-4 h-4" />
                                  ) : currentUser.verificationStatus === 'rejected' ? (
                                    <AlertCircle className="w-4 h-4" />
                                  ) : (
                                    <UserCheck className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-sm font-semibold truncate ${
                                      currentUser.verificationStatus === 'rejected'
                                        ? 'text-rose-700'
                                        : 'text-slate-800 group-hover:text-slate-900'
                                    }`}>
                                      {currentUser.verificationStatus === 'verified'
                                        ? 'Verificación OK'
                                        : currentUser.verificationStatus === 'rejected'
                                        ? 'Verificación Rechazada'
                                        : currentUser.verificationStatus === 'pending_review'
                                        ? 'Verificación en Revisión'
                                        : 'Verificar Mi Cuenta'}
                                    </span>
                                  </div>
                                  <span className="block text-[11px] text-slate-400 truncate">
                                    {currentUser.verificationStatus === 'verified'
                                      ? 'Identidad biométrica y cédula al día'
                                      : currentUser.verificationStatus === 'rejected'
                                      ? 'Revisa el motivo del rechazo y corrige'
                                      : 'Validación de cédula chilena y biometría'}
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
                              </button>

                              <button
                                onClick={() => handleMenuNavigate('support')}
                                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition group cursor-pointer ${
                                  currentView === 'support'
                                    ? 'bg-rose-50/70 text-rose-900'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${
                                    currentView === 'support'
                                      ? 'bg-rose-100 text-rose-600'
                                      : 'bg-slate-100/80 text-slate-500 group-hover:bg-rose-50 group-hover:text-rose-600'
                                  }`}
                                >
                                  <HelpCircle className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0 text-left">
                                  <span className="block text-sm font-semibold text-slate-800 group-hover:text-slate-900 truncate">
                                    Ayuda y Soporte
                                  </span>
                                  <span className="block text-[11px] text-slate-400 truncate">
                                    Reportar problemas del lugar y disputas
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
                              </button>
                            </div>
                          )}

                          {/* 4. Pie: Cerrar Sesión */}
                          <div className="p-2 bg-slate-50/40">
                            <button
                              onClick={() => {
                                logout();
                                setShowUserMenu(false);
                                onNavigate('home');
                              }}
                              className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-rose-50/80 text-rose-600 transition group cursor-pointer"
                            >
                              <div className="w-9 h-9 rounded-lg bg-rose-50 group-hover:bg-rose-100/80 flex items-center justify-center shrink-0 transition">
                                <LogOut className="w-4 h-4 text-rose-600" />
                              </div>
                              <span className="flex-1 text-sm font-semibold text-left">
                                Cerrar Sesión
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

