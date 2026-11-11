import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, ChevronDown, ChevronsLeft, ChevronsRight, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useReducedMotion } from '../../lib/motionPreference.ts';
import { getNameInitial } from '../../utils/formatters.ts';
import { BrandLogo, BrandMark } from '../BrandLogo.tsx';
import { EASE_LUXE } from '../motion/Motion.tsx';

// Un solo menú para los paneles de administración y propietario: secciones del
// panel, accesos al resto de Spotly, avisos, perfil y cerrar sesión.
//  · Escritorio (xl, 1280 px+): menú completo, contraíble a íconos (se recuerda).
//  · Tablet y laptop chica (md–lg): riel de íconos.
//  · Celular: barra superior con ☰ y avisos; el menú se abre como cajón.

export interface ShellItem<T extends string> {
  id: T | string;
  label: string;
  icon: LucideIcon;
  /** Algo espera una acción (rojo). */
  badge?: number;
  /** Solo informativo (gris). */
  count?: number;
  /** Etiqueta corta de estado (p. ej. "Al día"). */
  chip?: { label: string; tone: 'ok' | 'warn' | 'bad' };
  /** Si existe, el ítem navega fuera del panel en vez de cambiar de sección. */
  action?: () => void;
}

export interface ShellSection<T extends string> {
  label: string;
  items: ShellItem<T>[];
}

interface DashboardShellProps<T extends string> {
  area: string;
  sections: ShellSection<T>[];
  active: T;
  onSelect: (id: T) => void;
  onNavigate: (view: string, options?: { replace?: boolean }) => void;
  primaryAction?: { id?: string; label: string; icon: LucideIcon; onClick: () => void };
  /** Bloque opcional sobre el perfil (solo con el menú abierto). */
  footer?: React.ReactNode;
  storageKey: string;
  children: React.ReactNode;
}

const CHIP_TONE = {
  ok: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-rose-100 text-rose-800',
} as const;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

type Mode = 'side' | 'drawer';

export function DashboardShell<T extends string>({
  area,
  sections,
  active,
  onSelect,
  onNavigate,
  primaryAction,
  footer,
  storageKey,
  children,
}: DashboardShellProps<T>) {
  const { currentUser, logout, notifications, markAllNotificationsRead, dismissNotification } = useApp();
  const routerNavigate = useNavigate();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(() => readFlag(storageKey));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bell, setBell] = useState<{ from: Mode | 'bar'; rect: DOMRect } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const drawerId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const updateMore = () => {
    const el = scrollRef.current;
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateMore();
    const ro = new ResizeObserver(updateMore);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [collapsed]);

  const unread = notifications.filter((n) => !n.read).length;
  const current = (() => {
    for (const s of sections) for (const it of s.items) if (!it.action && it.id === active) return { section: s.label, item: it };
    return { section: sections[0]?.label ?? '', item: sections[0]?.items[0] };
  })();
  const pendingTotal = sections.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.badge || 0), 0), 0);
  const roleLabel = currentUser?.role === 'admin' ? 'Administración' : currentUser?.role === 'owner' ? 'Propietario' : 'Arrendatario';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(storageKey, c ? '0' : '1');
      } catch {
        /* sin almacenamiento */
      }
      return !c;
    });
  };

  const pick = (it: ShellItem<T>) => {
    setDrawerOpen(false);
    if (it.action) {
      it.action();
      return;
    }
    onSelect(it.id as T);
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  const handleLogout = () => {
    setDrawerOpen(false);
    logout();
    onNavigate('home', { replace: true });
  };

  const openBell = (from: Mode | 'bar', el: HTMLElement) => {
    setBell((b) => (b ? null : { from, rect: el.getBoundingClientRect() }));
  };

  // Cajón: Escape cierra, el foco queda adentro y vuelve al botón; el fondo no se desplaza.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>('[aria-current="page"], button')?.focus();
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bell) setDrawerOpen(false);
      if (e.key === 'Tab' && drawerRef.current) {
        const f = drawerRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      menuButtonRef.current?.focus();
    };
  }, [drawerOpen, bell]);

  // Avisos: Escape o clic afuera cierran.
  useEffect(() => {
    if (!bell) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBell(null);
    const onDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-bell]')) setBell(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [bell]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => mq.matches && setDrawerOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ---------- piezas ----------
  /** Clases según modo: en el lateral, contraído o tablet → solo íconos. */
  const label = (mode: Mode) => (mode === 'drawer' ? '' : collapsed ? 'sr-only' : 'sr-only xl:not-sr-only');
  const rowPad = (mode: Mode) =>
    mode === 'drawer' ? 'px-3' : collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-3';
  const showsDot = (mode: Mode) => (mode === 'side' ? (collapsed ? '' : 'xl:hidden') : 'hidden');

  const avatar = (size: string) => (
    <span className={`relative flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-rose-100 font-bold text-rose-700`}>
      {currentUser?.avatarUrl ? (
        <img src={currentUser.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        getNameInitial(currentUser?.firstNames || currentUser?.fullName || 'S')
      )}
    </span>
  );

  const bellButton = (from: Mode | 'bar', cls: string) => (
    <button
      type="button"
      data-bell
      onClick={(e) => openBell(from, e.currentTarget)}
      aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
      aria-expanded={bell?.from === from}
      className={`relative flex shrink-0 items-center justify-center rounded-xl border transition-colors duration-150 cursor-pointer active:scale-[0.96] ${
        bell?.from === from ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      } ${cls}`}
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
      <AnimatePresence>
        {unread > 0 && (
          <motion.span
            key={unread}
            aria-hidden="true"
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.4 }}
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white"
          />
        )}
      </AnimatePresence>
    </button>
  );

  const renderNav = (mode: Mode) => (
    <nav aria-label={`Menú de ${area.toLowerCase()}`} className={`flex flex-col ${mode === 'side' ? 'gap-3' : 'gap-4'}`}>
      {sections.map((section, si) => (
        <motion.div
          key={section.label}
          className="flex flex-col gap-0.5"
          initial={mode === 'drawer' && !reduce ? { opacity: 0, x: -10 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: EASE_LUXE, delay: mode === 'drawer' ? 0.06 + si * 0.04 : 0 }}
        >
          <p className={`${label(mode)} px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500`}>{section.label}</p>
          {section.items.map((it) => {
            const on = !it.action && it.id === active;
            const Icon = it.icon;
            const extra = it.badge ? `, ${it.badge} por atender` : it.chip ? `, ${it.chip.label}` : it.count !== undefined ? `, ${it.count}` : '';
            return (
              <button
                key={String(it.id)}
                type="button"
                onClick={() => pick(it)}
                aria-current={on ? 'page' : undefined}
                aria-label={`${it.label}${extra}`}
                title={mode === 'side' ? it.label : undefined}
                className={`group relative isolate flex min-h-11 w-full items-center gap-3 rounded-xl text-sm transition-[color,background-color,transform] duration-150 ease-out cursor-pointer active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 xl:min-h-9 ${rowPad(mode)} ${
                  on ? 'font-semibold text-white' : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                {on && (
                  <motion.span
                    layoutId={reduce ? undefined : `${area}-active-${mode}`}
                    className="absolute inset-0 -z-10 rounded-xl bg-slate-900 shadow-sm"
                    transition={{ type: 'spring', duration: 0.42, bounce: 0.14 }}
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={`h-5 w-5 shrink-0 transition-colors duration-150 ${on ? 'text-white' : 'text-slate-500 group-hover:text-slate-800'}`}
                  aria-hidden="true"
                />
                <span className={`${label(mode)} flex-1 truncate text-left`}>{it.label}</span>
                {it.badge ? (
                  <>
                    <motion.span
                      key={it.badge}
                      aria-hidden="true"
                      initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', duration: 0.4, bounce: 0.45 }}
                      className={`${label(mode)} inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-bold tabular-nums text-white`}
                    >
                      {it.badge}
                    </motion.span>
                    <span aria-hidden="true" className={`absolute right-2.5 top-2 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white ${showsDot(mode)}`} />
                  </>
                ) : it.chip ? (
                  <span aria-hidden="true" className={`${label(mode)} rounded-full px-2 py-0.5 text-[11px] font-bold ${CHIP_TONE[it.chip.tone]}`}>
                    {it.chip.label}
                  </span>
                ) : it.count !== undefined ? (
                  <span aria-hidden="true" className={`${label(mode)} text-xs tabular-nums ${on ? 'text-slate-300' : 'text-slate-500'}`}>
                    {it.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </motion.div>
      ))}
    </nav>
  );

  const primary = (mode: Mode) => {
    if (!primaryAction) return null;
    const Icon = primaryAction.icon;
    return (
      <button
        id={mode === 'side' ? primaryAction.id : undefined}
        type="button"
        onClick={() => {
          setDrawerOpen(false);
          primaryAction.onClick();
        }}
        title={mode === 'side' ? primaryAction.label : undefined}
        className={`group flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-rose-600 text-sm font-semibold text-white shadow-sm shadow-rose-600/20 transition-[background-color,transform,box-shadow] duration-150 ease-out hover:bg-rose-700 hover:shadow-md hover:shadow-rose-600/25 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 cursor-pointer ${
          mode === 'drawer' ? 'px-4' : collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-4'
        }`}
      >
        <Icon className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover:rotate-90" aria-hidden="true" />
        <span className={label(mode)}>{primaryAction.label}</span>
      </button>
    );
  };

  const profile = (mode: Mode) => (
    <div className={`flex items-center gap-1.5 ${mode === 'side' ? (collapsed ? 'flex-col' : 'flex-col xl:flex-row') : ''}`}>
      <button
        type="button"
        onClick={() => {
          setDrawerOpen(false);
          onNavigate('profile');
        }}
        title={mode === 'side' ? 'Mi perfil y cuenta' : undefined}
        aria-label={`Mi perfil y cuenta: ${currentUser?.fullName ?? ''}`}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors duration-150 hover:bg-slate-100 cursor-pointer ${
          mode === 'side' ? (collapsed ? 'justify-center' : 'justify-center xl:justify-start') : ''
        }`}
      >
        <span className="relative">
          {avatar('h-9 w-9 text-sm')}
          {currentUser?.verificationStatus === 'verified' && (
            <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          )}
        </span>
        <span className={`${label(mode)} min-w-0`}>
          <span className="block truncate text-sm font-semibold text-slate-900">{currentUser?.fullName}</span>
          <span className="block truncate text-xs text-slate-600">{roleLabel} · Mi perfil</span>
        </span>
      </button>
      <button
        type="button"
        onClick={handleLogout}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700 transition-[background-color,transform] duration-150 hover:bg-rose-100 active:scale-[0.94] cursor-pointer"
      >
        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </div>
  );

  // ---------- avisos (popover) ----------
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!bell) return;
    if (bell.from === 'side' && window.innerWidth >= 768) {
      setPopStyle({ left: bell.rect.right + 10, top: Math.max(12, bell.rect.top) });
    } else {
      setPopStyle({ left: 12, right: 12, top: bell.rect.bottom + 8 });
    }
  }, [bell]);

  const notificationsPopover = (
    <AnimatePresence>
      {bell && (
        <motion.div
          ref={popRef}
          role="dialog"
          aria-label="Notificaciones"
          style={popStyle}
          initial={reduce ? false : { opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2, ease: EASE_LUXE }}
          className={`fixed z-[60] flex max-h-[min(30rem,calc(100dvh-6rem))] flex-col rounded-2xl border border-slate-200 bg-white py-3 shadow-2xl ${
            bell.from === 'side' ? 'origin-top-left md:w-[22rem]' : 'origin-top'
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 pb-2.5">
            <p className="text-sm font-bold text-slate-900">
              Notificaciones{unread > 0 && <span className="font-semibold text-rose-600"> · {unread} nuevas</span>}
            </p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button type="button" onClick={markAllNotificationsRead} className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer">
                  Marcar leídas
                </button>
              )}
              <button type="button" onClick={() => setBell(null)} aria-label="Cerrar notificaciones" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto overscroll-contain divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No tienes notificaciones.</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`flex items-start gap-3 p-3.5 transition-colors hover:bg-slate-50 ${n.read ? '' : 'bg-rose-50/40'}`}>
                  <button
                    type="button"
                    disabled={!n.link}
                    onClick={() => {
                      if (!n.link) return;
                      setBell(null);
                      setDrawerOpen(false);
                      routerNavigate(n.link);
                    }}
                    className="min-w-0 flex-1 space-y-0.5 text-left disabled:cursor-default cursor-pointer"
                  >
                    <span className="block break-words text-sm font-semibold text-slate-900">{n.title}</span>
                    <span className="block break-words text-xs leading-relaxed text-slate-600">{n.message}</span>
                    <span className="block text-xs text-slate-500">
                      {new Date(n.timestamp).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </button>
                  <button type="button" onClick={() => dismissNotification(n.id)} aria-label="Descartar notificación" className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 cursor-pointer">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* Menú lateral (tablet y escritorio) */}
      <aside
        aria-label={`Menú de ${area.toLowerCase()}`}
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out md:flex md:w-[4.75rem] ${
          collapsed ? '' : 'xl:w-[17.5rem]'
        }`}
      >
        <div className={`flex items-center gap-2 px-3 pb-3 pt-4 ${collapsed ? 'flex-col' : 'flex-col xl:flex-row xl:justify-between xl:pl-4'}`}>
          <button type="button" onClick={() => onNavigate('home')} aria-label="Spotly, ir al inicio" className="rounded-lg cursor-pointer">
            <span className={collapsed ? 'hidden' : 'hidden xl:inline'}>
              <BrandLogo className="text-[1.6rem]" />
            </span>
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ${collapsed ? '' : 'xl:hidden'}`}>
              <BrandMark className="h-6 w-6" />
            </span>
          </button>
          <div className={`flex items-center gap-1.5 ${collapsed ? 'flex-col' : 'flex-col xl:flex-row'}`}>
            {bellButton('side', 'h-10 w-10')}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              title={collapsed ? 'Expandir menú' : 'Contraer menú'}
              className="hidden h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-[background-color,transform] duration-150 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.94] cursor-pointer xl:flex"
            >
              {collapsed ? <ChevronsRight className="h-5 w-5" aria-hidden="true" /> : <ChevronsLeft className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={updateMore}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin]"
          >
            {primary('side')}
            {renderNav('side')}
            {footer && <div className={collapsed ? 'hidden' : 'hidden xl:block'}>{footer}</div>}
          </div>
          {/* Indica que hay más opciones abajo */}
          <AnimatePresence>
            {more && (
              <motion.button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => scrollRef.current?.scrollBy({ top: 200, behavior: reduce ? 'auto' : 'smooth' })}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-x-0 bottom-0 flex h-10 items-end justify-center bg-gradient-to-t from-white via-white/85 to-transparent pb-1 cursor-pointer"
              >
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t border-slate-200 px-3 pb-3 pt-2.5">{profile('side')}</div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Celular: barra superior */}
        <div
          className={`sticky top-0 z-30 flex items-center gap-2.5 border-b bg-white/90 px-3 py-2.5 backdrop-blur-md transition-[box-shadow,border-color] duration-200 md:hidden ${
            scrolled ? 'border-slate-200 shadow-sm' : 'border-transparent'
          }`}
        >
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls={drawerId}
            aria-label={pendingTotal ? `Abrir menú, ${pendingTotal} por atender` : 'Abrir menú'}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 transition-transform active:scale-[0.94] cursor-pointer"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            {pendingTotal > 0 && (
              <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                {pendingTotal}
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-600">
              {area} · {current.section}
            </p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={String(current.item?.id)}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: EASE_LUXE }}
                className="truncate text-base font-bold text-slate-950"
              >
                {current.item?.label}
              </motion.p>
            </AnimatePresence>
          </div>
          {bellButton('bar', 'h-11 w-11')}
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              aria-label={primaryAction.label}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm transition-transform active:scale-[0.94] cursor-pointer"
            >
              <primaryAction.icon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="mx-auto w-full max-w-[1400px] px-3 pb-16 pt-4 sm:px-5 md:px-6 md:pt-7 lg:px-8">
          <div className="mb-5 hidden md:block">
            <p className="text-xs font-medium text-slate-600">
              {area} / {current.section}
            </p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.h1
                key={String(current.item?.id)}
                initial={reduce ? false : { opacity: 0, y: 8, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.12 } }}
                transition={{ duration: 0.28, ease: EASE_LUXE }}
                className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem]"
              >
                {current.item?.label}
              </motion.h1>
            </AnimatePresence>
          </div>
          {children}
        </div>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <>
            <AnimatePresence>
              {drawerOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                  <motion.div
                    className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.18 } }}
                    transition={{ duration: 0.22 }}
                    onClick={() => setDrawerOpen(false)}
                  />
                  <motion.div
                    ref={drawerRef}
                    id={drawerId}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Menú de ${area.toLowerCase()}`}
                    className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-white shadow-2xl"
                    initial={reduce ? false : { x: '-100%' }}
                    animate={{ x: 0 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { x: '-100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
                    transition={{ duration: 0.32, ease: EASE_LUXE }}
                  >
                    <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                      <BrandLogo className="text-[1.5rem]" />
                      <button
                        type="button"
                        onClick={() => setDrawerOpen(false)}
                        aria-label="Cerrar menú"
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-800 transition-transform active:scale-[0.94] cursor-pointer"
                      >
                        <X className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-3">
                      {primary('drawer')}
                      {renderNav('drawer')}
                      {footer}
                    </div>
                    <div className="border-t border-slate-200 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">{profile('drawer')}</div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
            {notificationsPopover}
          </>,
          document.body
        )}
    </div>
  );
}
