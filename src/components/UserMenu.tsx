import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Briefcase,
  ChevronRight,
  FileText,
  Heart,
  HelpCircle,
  LogOut,
  PlusCircle,
  Search,
  ShieldCheck,
  UserCheck,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useReducedMotion } from '../lib/motionPreference.ts';
import { formatRut, getNameInitial } from '../utils/formatters.ts';
import { EASE_LUXE } from './motion/Motion.tsx';

// Menú de la cuenta en las páginas públicas (inicio, catálogo, ficha…). Mismo
// lenguaje que el menú lateral de los paneles: grupos, filas compactas, la
// página actual marcada y cerrar sesión al pie.

interface Row {
  view: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  count?: number;
  chip?: { label: string; tone: 'ok' | 'warn' | 'bad' };
}

const CHIP_TONE = {
  ok: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-rose-100 text-rose-800',
} as const;

interface UserMenuProps {
  open: boolean;
  currentView: string;
  onClose: () => void;
  onNavigate: (view: string, options?: { replace?: boolean }) => void;
  onOpenOwnerUpgrade: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({ open, currentView, onClose, onNavigate, onOpenOwnerUpgrade }) => {
  const { currentUser, logout, favoriteSpaceIds } = useApp();
  const reduce = useReducedMotion();
  if (!currentUser) return null;

  const go = (view: string) => {
    onClose();
    onNavigate(view);
  };

  const isAdmin = currentUser.role === 'admin';
  const isOwner = currentUser.role === 'owner' || Boolean(currentUser.ownerTermsAccepted);
  const onCatalog = currentView === 'home' || currentView === 'space-detail';
  const roleLabel = isAdmin ? 'Administración' : currentUser.role === 'owner' ? 'Propietario' : 'Arrendatario';
  const kyc = currentUser.verificationStatus;
  const kycChip: Row['chip'] =
    kyc === 'verified'
      ? { label: 'Al día', tone: 'ok' }
      : kyc === 'rejected'
        ? { label: 'Rechazada', tone: 'bad' }
        : kyc === 'pending_review'
          ? { label: 'En revisión', tone: 'warn' }
          : { label: 'Pendiente', tone: 'warn' };

  const groups: { label: string; rows: Row[] }[] = isAdmin
    ? [
        {
          label: 'Sitio',
          rows: [
            { view: 'home', label: 'Catálogo público', icon: Search, active: onCatalog },
            { view: 'support', label: 'Ayuda y soporte', icon: HelpCircle, active: currentView === 'support' },
          ],
        },
        { label: 'Cuenta', rows: [{ view: 'profile', label: 'Mi perfil y cuenta', icon: UserRound, active: currentView === 'profile' }] },
      ]
    : [
        {
          label: 'Arrendar',
          rows: [
            { view: 'home', label: 'Explorar espacios', icon: Search, active: onCatalog },
            { view: 'my-bookings', label: 'Mis reservas', icon: FileText, active: currentView === 'my-bookings' },
            { view: 'favorites', label: 'Mis favoritos', icon: Heart, active: currentView === 'favorites', count: favoriteSpaceIds.length || undefined },
          ],
        },
        { label: 'Dinero', rows: [{ view: 'wallet', label: 'Billetera', icon: Wallet, active: currentView === 'wallet' }] },
        {
          label: 'Cuenta',
          rows: [
            { view: 'profile', label: 'Mi perfil y cuenta', icon: UserRound, active: currentView === 'profile' },
            { view: 'onboarding', label: 'Verificación', icon: UserCheck, active: currentView === 'onboarding', chip: kycChip },
            { view: 'support', label: 'Ayuda y soporte', icon: HelpCircle, active: currentView === 'support' },
          ],
        },
      ];

  const primary = isAdmin
    ? { label: 'Panel de administración', detail: 'Verificaciones, ganancias y auditoría', icon: ShieldCheck, onClick: () => go('admin'), tone: 'dark' as const }
    : isOwner
      ? { label: 'Mis espacios', detail: 'Solicitudes, calendario y ganancias', icon: Briefcase, onClick: () => go('owner'), tone: currentView === 'owner' ? ('dark' as const) : ('rose' as const) }
      : {
          label: 'Publica tu espacio',
          detail: 'Activa tu perfil de anfitrión',
          icon: PlusCircle,
          onClick: () => {
            onClose();
            onOpenOwnerUpgrade();
          },
          tone: 'rose' as const,
        };
  const PrimaryIcon = primary.icon;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={onClose}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          />
          <motion.div
            role="menu"
            aria-label="Menú de tu cuenta"
            initial={reduce ? false : { opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE_LUXE }}
            className="fixed inset-x-3 top-[4.5rem] z-50 flex max-h-[calc(100dvh-5.25rem)] origin-top flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-16px_rgba(15,23,42,0.28)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2.5 sm:max-h-[calc(100dvh-6.5rem)] sm:w-[21.5rem] sm:origin-top-right"
          >
            {/* Quién eres */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
              <span className="relative shrink-0">
                <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-rose-100 text-base font-bold text-rose-700">
                  {currentUser.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getNameInitial(currentUser.firstNames || currentUser.fullName)
                  )}
                </span>
                {kyc === 'verified' && <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-950">{currentUser.fullName}</span>
                <span className="block truncate text-xs text-slate-600">
                  {roleLabel}
                  {currentUser.rut ? ` · RUT ${formatRut(currentUser.rut)}` : ''}
                </span>
              </span>
              <button type="button" onClick={onClose} aria-label="Cerrar menú" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 sm:hidden cursor-pointer">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
              {/* Acción principal según el rol */}
              <button
                type="button"
                role="menuitem"
                onClick={primary.onClick}
                className={`group mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-white shadow-sm transition-[background-color,transform] duration-150 active:scale-[0.98] cursor-pointer ${
                  primary.tone === 'dark' ? 'bg-slate-900 hover:bg-slate-800' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <PrimaryIcon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{primary.label}</span>
                  <span className="block truncate text-xs text-white/80">{primary.detail}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/80 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </button>

              {groups.map((g, gi) => (
                <motion.div
                  key={g.label}
                  className="pt-2"
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: EASE_LUXE, delay: 0.04 + gi * 0.035 }}
                >
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{g.label}</p>
                  {g.rows.map((r) => {
                    const Icon = r.icon;
                    return (
                      <button
                        key={r.view + r.label}
                        type="button"
                        role="menuitem"
                        aria-current={r.active ? 'page' : undefined}
                        onClick={() => go(r.view)}
                        className={`group flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition-[background-color,color,transform] duration-150 active:scale-[0.98] cursor-pointer ${
                          r.active ? 'bg-slate-900 font-semibold text-white' : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 shrink-0 ${r.active ? 'text-white' : 'text-slate-500 group-hover:text-slate-800'} ${
                            r.view === 'favorites' && r.count ? (r.active ? '' : 'fill-rose-500 text-rose-500') : ''
                          }`}
                          aria-hidden="true"
                        />
                        <span className="flex-1 truncate text-left">{r.label}</span>
                        {r.chip ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP_TONE[r.chip.tone]}`}>{r.chip.label}</span>
                        ) : r.count ? (
                          <span className={`text-xs tabular-nums ${r.active ? 'text-slate-300' : 'text-slate-500'}`}>{r.count}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </motion.div>
              ))}
            </div>

            <div className="border-t border-slate-100 p-2">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose();
                  logout();
                  // Se reemplaza la página actual: "atrás" no vuelve a una vista privada.
                  onNavigate('home', { replace: true });
                }}
                className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-rose-700 transition-[background-color,transform] duration-150 hover:bg-rose-50 active:scale-[0.98] cursor-pointer"
              >
                <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
                Cerrar sesión
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
