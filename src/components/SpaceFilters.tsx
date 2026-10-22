import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, SlidersHorizontal, X, LayoutGrid, Sun, Building2, ChevronDown, Check } from 'lucide-react';
import { SPACE_CATEGORIES } from '../utils/spaceCategories.ts';

export type RateFilter = 'all' | 'hour' | 'day' | 'month';
export type EnvironmentFilter = 'all' | 'abierto' | 'cerrado';

export const ALL_COMMUNES = 'Todas las comunas';

const RATES: { id: RateFilter; label: string }[] = [
  { id: 'all', label: 'Cualquiera' },
  { id: 'hour', label: 'Por hora' },
  { id: 'day', label: 'Por día' },
  { id: 'month', label: 'Por mes' },
];

/* ------------------------------------------------------------------ */
/* Buscador principal                                                  */
/* ------------------------------------------------------------------ */

interface HeroSearchProps {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  commune: string;
  communes: string[];
  onCommuneChange: (v: string) => void;
  rate: RateFilter;
  onRateChange: (v: RateFilter) => void;
  onSubmit: () => void;
}

/** Píldora de búsqueda: qué · dónde · cómo · buscar. En móvil se apila. */
export const HeroSearch: React.FC<HeroSearchProps> = ({
  searchTerm,
  onSearchChange,
  commune,
  communes,
  onCommuneChange,
  rate,
  onRateChange,
  onSubmit,
}) => {
  const [focused, setFocused] = useState<string | null>(null);
  const segment = (id: string) =>
    `relative block flex-1 min-w-0 rounded-2xl md:rounded-full px-5 py-2.5 md:px-6 md:py-3 text-left transition-colors duration-200 ${
      focused === id ? 'bg-white shadow-lg' : 'hover:bg-slate-100'
    }`;

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={`w-full rounded-[1.75rem] border border-slate-200 p-2 shadow-md transition-colors duration-200 md:flex md:items-center md:rounded-full md:p-1.5 ${
        focused ? 'bg-slate-100' : 'bg-white'
      }`}
    >
      <label className={segment('q')}>
        <span className="block text-[12px] font-semibold text-slate-900">Qué buscas</span>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setFocused('q')}
          onBlur={() => setFocused(null)}
          placeholder="Oficina, sala, estudio, quincho…"
          className="block w-full bg-transparent text-[15px] text-slate-900 placeholder:text-slate-500 outline-none [&::-webkit-search-cancel-button]:hidden"
        />
      </label>

      <span className="hidden h-8 w-px shrink-0 bg-slate-200 md:block" aria-hidden="true" />

      <label className={segment('where')}>
        <span className="block text-[12px] font-semibold text-slate-900">Dónde</span>
        <span className="relative flex items-center">
          <select
            value={commune}
            onChange={(e) => onCommuneChange(e.target.value)}
            onFocus={() => setFocused('where')}
            onBlur={() => setFocused(null)}
            className="block w-full appearance-none bg-transparent pr-6 text-[15px] text-slate-900 outline-none cursor-pointer"
          >
            {[ALL_COMMUNES, ...communes].map((c) => (
              <option key={c} value={c}>
                {c === ALL_COMMUNES ? 'Todo Chile' : c}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-slate-400" />
        </span>
      </label>

      <span className="hidden h-8 w-px shrink-0 bg-slate-200 md:block" aria-hidden="true" />

      <div
        className={`${segment('rate')} md:flex-[1.25]`}
        onFocus={() => setFocused('rate')}
        onBlur={() => setFocused(null)}
      >
        <span className="block text-[12px] font-semibold text-slate-900" id="hero-rate-label">
          Cómo arriendas
        </span>
        <div className="-ml-2.5 mt-0.5 flex gap-1" role="radiogroup" aria-labelledby="hero-rate-label">
          {RATES.filter((r) => r.id !== 'all').map((r) => {
            const active = rate === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onRateChange(active ? 'all' : r.id)}
                className={`relative rounded-full px-2.5 py-0.5 text-[13.5px] transition-colors duration-200 cursor-pointer ${
                  active ? 'text-white' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="hero-rate-pill"
                    className="absolute inset-0 rounded-full bg-slate-950"
                    transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                  />
                )}
                <span className="relative">{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 md:mt-0 md:ml-1 md:w-auto md:py-4 cursor-pointer"
      >
        <Search className="h-[18px] w-[18px]" strokeWidth={2.5} />
        <span>Buscar</span>
      </button>
    </form>
  );
};

/* ------------------------------------------------------------------ */
/* Riel de categorías                                                  */
/* ------------------------------------------------------------------ */

interface CategoryRailProps {
  selected: string;
  onChange: (id: string) => void;
  counts?: Record<string, number>;
}

const RAIL = [{ id: 'all', label: 'Todos', icon: LayoutGrid }, ...SPACE_CATEGORIES.map((c) => ({ id: c.id, label: c.plural, icon: c.icon }))];

export const CategoryRail: React.FC<CategoryRailProps> = ({ selected, onChange, counts }) => {
  const scroller = useRef<HTMLDivElement>(null);
  // Mantiene visible la categoría elegida cuando se cambia desde otro lugar.
  useEffect(() => {
    // Solo desplaza el riel en horizontal (scrollIntoView movería la página).
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-cat="${selected}"]`);
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft) box.scrollTo({ left: left - 24, behavior: 'smooth' });
    else if (left + el.offsetWidth > box.scrollLeft + box.clientWidth)
      box.scrollTo({ left: left + el.offsetWidth - box.clientWidth + 24, behavior: 'smooth' });
  }, [selected]);

  return (
    <div ref={scroller} className="no-scrollbar fade-x -mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Tipos de espacio">
      {RAIL.filter((c) => c.id === 'all' || !counts || (counts[c.id] ?? 0) > 0).map((c) => {
        const Icon = c.icon;
        const active = selected === c.id;
        return (
          <button
            key={c.id}
            data-cat={c.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.id)}
            className={`group relative flex shrink-0 flex-col items-center gap-1.5 px-3 pb-3 pt-2 transition-colors duration-200 cursor-pointer ${
              active ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Icon
              className={`h-6 w-6 transition-transform duration-200 ease-[var(--ease-out)] ${active ? '' : 'group-hover:-translate-y-0.5'}`}
              strokeWidth={active ? 2 : 1.6}
            />
            <span className="whitespace-nowrap text-[12.5px] font-medium">{c.label}</span>
            {active ? (
              <motion.span
                layoutId="category-underline"
                className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-slate-950"
                transition={{ type: 'spring', duration: 0.4, bounce: 0.1 }}
              />
            ) : (
              <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Panel de filtros                                                    */
/* ------------------------------------------------------------------ */

interface FilterPanelProps {
  environment: EnvironmentFilter;
  onEnvironmentChange: (v: EnvironmentFilter) => void;
  rate: RateFilter;
  onRateChange: (v: RateFilter) => void;
  minSurfaceM2: number;
  onMinSurfaceChange: (v: number) => void;
  instantOnly: boolean;
  onInstantOnlyChange: (v: boolean) => void;
  activeCount: number;
  resultCount: number;
  onReset: () => void;
}

const SURFACE_DEFAULT = 10;

export const FilterButton: React.FC<FilterPanelProps> = (props) => {
  const [open, setOpen] = useState(false);
  const { activeCount } = props;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition-colors cursor-pointer ${
          activeCount > 0 ? 'border-slate-950 bg-slate-50 text-slate-950' : 'border-slate-200 text-slate-800 hover:border-slate-400'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filtros
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-950 px-1.5 text-[12.5px] text-white tabular">
            {activeCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
            <motion.div
              className="absolute inset-0 bg-slate-950/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="filters-title"
              initial={{ y: '100%', opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0.6 }}
              transition={{ type: 'tween', duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
              className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:max-w-xl sm:rounded-[1.75rem]"
            >
              <FilterPanelBody {...props} onClose={() => setOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const Segmented = <T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  options: { id: T; label: string; icon?: React.ComponentType<{ className?: string }> }[];
  onChange: (v: T) => void;
  name: string;
}) => (
  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={name}>
    {options.map((o) => {
      const active = value === o.id;
      const Icon = o.icon;
      return (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(o.id)}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-[13.5px] font-medium transition-colors cursor-pointer ${
            active ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 text-slate-700 hover:border-slate-400'
          }`}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {o.label}
        </button>
      );
    })}
  </div>
);

const FilterPanelBody: React.FC<FilterPanelProps & { onClose: () => void }> = ({
  environment,
  onEnvironmentChange,
  rate,
  onRateChange,
  minSurfaceM2,
  onMinSurfaceChange,
  instantOnly,
  onInstantOnlyChange,
  resultCount,
  onReset,
  onClose,
}) => (
  <>
    <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
      <button type="button" onClick={onClose} aria-label="Cerrar filtros" className="rounded-full p-1.5 hover:bg-slate-100 cursor-pointer">
        <X className="h-5 w-5" />
      </button>
      <h2 id="filters-title" className="text-[15px] font-semibold">
        Filtros
      </h2>
      <span className="w-8" />
    </header>

    <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
      <section className="space-y-3">
        <h3 className="text-[17px] font-semibold text-slate-950">Modalidad de arriendo</h3>
        <Segmented name="Modalidad de arriendo" value={rate} onChange={onRateChange} options={RATES} />
      </section>

      <section className="space-y-3">
        <h3 className="text-[17px] font-semibold text-slate-950">Entorno</h3>
        <Segmented
          name="Entorno"
          value={environment}
          onChange={onEnvironmentChange}
          options={[
            { id: 'all', label: 'Todos' },
            { id: 'cerrado', label: 'Interior', icon: Building2 },
            { id: 'abierto', label: 'Aire libre', icon: Sun },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[17px] font-semibold text-slate-950">Superficie mínima</h3>
          <span className="text-[15px] font-semibold text-slate-950 tabular">{minSurfaceM2} m²</span>
        </div>
        <input
          type="range"
          min={SURFACE_DEFAULT}
          max={300}
          step={5}
          value={minSurfaceM2}
          onChange={(e) => onMinSurfaceChange(Number(e.target.value))}
          aria-label="Superficie mínima en metros cuadrados"
          className="w-full accent-slate-950 cursor-pointer"
        />
        <div className="flex justify-between text-[12px] text-slate-500 tabular">
          <span>{SURFACE_DEFAULT} m²</span>
          <span>300 m²</span>
        </div>
      </section>

      <section>
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span>
            <span className="block text-[17px] font-semibold text-slate-950">Reserva inmediata</span>
            <span className="block text-[13.5px] text-slate-500">Espacios que se confirman al pagar, sin esperar al anfitrión.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={instantOnly}
            onClick={() => onInstantOnlyChange(!instantOnly)}
            className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200 cursor-pointer ${
              instantOnly ? 'bg-slate-950' : 'bg-slate-300'
            }`}
          >
            <motion.span
              layout
              transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
              className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow ${instantOnly ? 'right-1' : 'left-1'}`}
            >
              {instantOnly && <Check className="h-3.5 w-3.5 text-slate-950" strokeWidth={3} />}
            </motion.span>
          </button>
        </label>
      </section>
    </div>

    <footer className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
      <button type="button" onClick={onReset} className="text-[15px] font-semibold text-slate-950 underline cursor-pointer">
        Quitar todo
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl bg-slate-950 px-6 py-3 text-[15px] font-semibold text-white hover:bg-slate-800 cursor-pointer tabular"
      >
        Mostrar {resultCount} {resultCount === 1 ? 'espacio' : 'espacios'}
      </button>
    </footer>
  </>
);

export const countActiveFilters = (f: {
  environment: EnvironmentFilter;
  rate: RateFilter;
  minSurfaceM2: number;
  instantOnly: boolean;
}) =>
  (f.environment !== 'all' ? 1 : 0) +
  (f.rate !== 'all' ? 1 : 0) +
  (f.minSurfaceM2 > SURFACE_DEFAULT ? 1 : 0) +
  (f.instantOnly ? 1 : 0);

export { SURFACE_DEFAULT };
