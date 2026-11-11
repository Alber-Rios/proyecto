import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronsLeft, ChevronsRight, Menu, X, type LucideIcon } from 'lucide-react';
import { useReducedMotion } from '../../lib/motionPreference.ts';
import { EASE_LUXE } from '../motion/Motion.tsx';

// Estructura común de los paneles de administración y propietario:
//  · Escritorio (xl+, 1280 px): menú lateral fijo, que se puede contraer a solo íconos.
//  · Tablet y laptop chica (md–lg): riel de íconos siempre contraído.
//  · Celular:          barra con el botón de menú, que abre el panel como cajón.

export interface ShellItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Algo espera una acción (se muestra en rojo). */
  badge?: number;
  /** Solo informativo (se muestra en gris). */
  count?: number;
}

export interface ShellSection<T extends string> {
  label: string;
  items: ShellItem<T>[];
}

interface DashboardShellProps<T extends string> {
  /** "Administración", "Mis espacios"… (va antes del grupo en la ruta). */
  area: string;
  sections: ShellSection<T>[];
  active: T;
  onSelect: (id: T) => void;
  /** Tarjeta de quién está usando el panel. */
  identity: { name: string; detail: string; initial: string; tone?: 'rose' | 'indigo' };
  primaryAction?: { id?: string; label: string; icon: LucideIcon; onClick: () => void };
  /** Bloque opcional al pie del menú (solo con el menú abierto). */
  footer?: React.ReactNode;
  onExit?: () => void;
  exitLabel?: string;
  /** Recuerda si el menú quedó contraído (solo en este navegador). */
  storageKey: string;
  children: React.ReactNode;
}

function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function DashboardShell<T extends string>({
  area,
  sections,
  active,
  onSelect,
  identity,
  primaryAction,
  footer,
  onExit,
  exitLabel = 'Ir al catálogo',
  storageKey,
  children,
}: DashboardShellProps<T>) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const current = (() => {
    for (const s of sections) for (const it of s.items) if (it.id === active) return { section: s.label, item: it };
    return { section: sections[0]?.label ?? '', item: sections[0]?.items[0] };
  })();
  const pendingTotal = sections.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.badge || 0), 0), 0);

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

  const select = (id: T) => {
    onSelect(id);
    setDrawerOpen(false);
    // Al cambiar de sección, vuelve al inicio del contenido si quedó arriba de la pantalla.
    const top = contentRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 80, behavior: reduce ? 'auto' : 'smooth' });
  };

  // Cajón del celular: Escape cierra, el foco entra y vuelve al botón, sin desplazar el fondo.
  useEffect(() => {
    if (!drawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFirst = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>('[aria-current="page"], button, a')?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusFirst);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      menuButtonRef.current?.focus();
    };
  }, [drawerOpen]);

  // Si la pantalla crece a tablet/escritorio con el cajón abierto, se cierra.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => mq.matches && setDrawerOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const avatarTone = identity.tone === 'indigo' ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-100 text-rose-700';

  /** Lista de secciones. `rail` = solo íconos (tablet o menú contraído). */
  const renderNav = (mode: 'side' | 'drawer') => {
    // En el lateral: contraído por el usuario → íconos; en tablet siempre íconos.
    const labelCls = mode === 'drawer' ? '' : collapsed ? 'sr-only' : 'sr-only xl:not-sr-only';
    const groupCls = mode === 'drawer' ? '' : collapsed ? 'sr-only' : 'sr-only xl:not-sr-only';
    const itemPad = mode === 'drawer' ? 'px-3' : collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-3';
    return (
      <nav aria-label={`Secciones de ${area.toLowerCase()}`} className="flex flex-col gap-5">
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            <p className={`${groupCls} px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500`}>
              {section.label}
            </p>
            {section.items.map((it) => {
              const on = it.id === active;
              const Icon = it.icon;
              const extra = it.badge ? `, ${it.badge} por atender` : it.count !== undefined ? `, ${it.count}` : '';
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => select(it.id)}
                  aria-current={on ? 'page' : undefined}
                  aria-label={`${it.label}${extra}`}
                  title={mode === 'side' ? it.label : undefined}
                  className={`group relative flex min-h-11 w-full items-center gap-3 rounded-xl text-sm transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 ${itemPad} ${
                    on ? 'bg-slate-900 font-semibold text-white' : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  <Icon className={`h-5 w-5 shrink-0 ${on ? 'text-white' : 'text-slate-500 group-hover:text-slate-700'}`} aria-hidden="true" />
                  <span className={`${labelCls} flex-1 truncate text-left`}>{it.label}</span>
                  {it.badge ? (
                    <>
                      <span
                        aria-hidden="true"
                        className={`${labelCls} inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-bold tabular-nums text-white`}
                      >
                        {it.badge}
                      </span>
                      {mode === 'side' && (
                        <span
                          aria-hidden="true"
                          className={`absolute right-2.5 top-2 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white ${collapsed ? '' : 'xl:hidden'}`}
                        />
                      )}
                    </>
                  ) : it.count !== undefined ? (
                    <span aria-hidden="true" className={`${labelCls} text-xs tabular-nums ${on ? 'text-slate-300' : 'text-slate-500'}`}>
                      {it.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    );
  };

  const identityCard = (mode: 'side' | 'drawer') => (
    <div
      className={`${mode === 'side' ? (collapsed ? 'hidden' : 'hidden xl:flex') : 'flex'} items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarTone}`} aria-hidden="true">
        {identity.initial}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900">{identity.name}</span>
        <span className="block truncate text-xs text-slate-600">{identity.detail}</span>
      </span>
    </div>
  );

  const primary = (mode: 'side' | 'drawer') => {
    if (!primaryAction) return null;
    const Icon = primaryAction.icon;
    const pad = mode === 'drawer' ? 'px-4' : collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-4';
    const labelCls = mode === 'drawer' ? '' : collapsed ? 'sr-only' : 'sr-only xl:not-sr-only';
    return (
      <button
        id={mode === 'side' ? primaryAction.id : undefined}
        type="button"
        onClick={() => {
          setDrawerOpen(false);
          primaryAction.onClick();
        }}
        title={mode === 'side' ? primaryAction.label : undefined}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-rose-600 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 cursor-pointer ${pad}`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className={labelCls}>{primaryAction.label}</span>
      </button>
    );
  };

  const bottom = (mode: 'side' | 'drawer') => {
    const labelCls = mode === 'drawer' ? '' : collapsed ? 'sr-only' : 'sr-only xl:not-sr-only';
    const pad = mode === 'drawer' ? 'px-3' : collapsed ? 'justify-center px-0' : 'justify-center px-0 xl:justify-start xl:px-3';
    return (
      <div className="flex flex-col gap-1 border-t border-slate-200 pt-3">
        {onExit && (
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              onExit();
            }}
            title={mode === 'side' ? exitLabel : undefined}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer ${pad}`}
          >
            <ArrowLeft className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className={labelCls}>{exitLabel}</span>
          </button>
        )}
        {mode === 'side' && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
            className={`hidden min-h-11 w-full items-center gap-3 rounded-xl text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 cursor-pointer xl:flex ${
              collapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            {collapsed ? (
              <ChevronsRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            )}
            <span className={collapsed ? 'sr-only' : ''}>{collapsed ? 'Expandir menú' : 'Contraer menú'}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="md:flex md:items-start md:gap-5 xl:gap-7">
      {/* Lateral: tablet (riel de íconos) y escritorio */}
      <aside
        aria-label={`Menú de ${area.toLowerCase()}`}
        className={`hidden md:flex md:sticky md:top-[4.5rem] md:max-h-[calc(100dvh-5.5rem)] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-2xs transition-[width] duration-200 ease-out no-scrollbar md:w-[4.25rem] ${
          collapsed ? '' : 'xl:w-64 xl:p-3'
        }`}
      >
        {identityCard('side')}
        {primary('side')}
        <div className="flex-1">{renderNav('side')}</div>
        {footer && <div className={collapsed ? 'hidden' : 'hidden xl:block'}>{footer}</div>}
        {bottom('side')}
      </aside>

      <div ref={contentRef} className="min-w-0 flex-1">
        {/* Celular: barra con el menú y la sección actual */}
        <div className="sticky top-14 z-30 -mx-3 mb-4 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:-mx-5 sm:px-5 md:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls={drawerId}
            aria-label={pendingTotal ? `Abrir menú, ${pendingTotal} por atender` : 'Abrir menú'}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 cursor-pointer"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            {pendingTotal > 0 && (
              <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">
                {pendingTotal}
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-600">
              {area} · {current.section}
            </p>
            <p className="truncate text-base font-bold text-slate-950">{current.item?.label}</p>
          </div>
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              aria-label={primaryAction.label}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white cursor-pointer"
            >
              <primaryAction.icon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Tablet y escritorio: dónde estás */}
        <div className="mb-5 hidden md:block">
          <p className="text-xs font-medium text-slate-600">
            {area} / {current.section}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">{current.item?.label}</h1>
        </div>

        {children}
      </div>

      {/* Cajón del celular */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              className="absolute inset-0 bg-slate-900/50"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              ref={drawerRef}
              id={drawerId}
              role="dialog"
              aria-modal="true"
              aria-label={`Menú de ${area.toLowerCase()}`}
              className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col gap-4 overflow-y-auto overscroll-contain bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
              initial={reduce ? false : { x: '-100%' }}
              animate={{ x: 0 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { x: '-100%' }}
              transition={{ duration: 0.28, ease: EASE_LUXE }}
            >
              <div className="flex items-center justify-between gap-2 pl-1">
                <span className="font-brand text-xl font-bold tracking-tight text-slate-950">{area}</span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Cerrar menú"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-800 cursor-pointer"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {identityCard('drawer')}
              {primary('drawer')}
              <div className="flex-1">{renderNav('drawer')}</div>
              {footer}
              {bottom('drawer')}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
