import React from 'react';
import {
  Search,
  MapPin,
  Building,
  Laptop,
  PartyPopper,
  Camera,
  Warehouse,
  RotateCcw,
  Sun,
  Building2,
  Clock,
  Layers,
  SlidersHorizontal,
  X,
  Maximize2
} from 'lucide-react';

export type RateFilter = 'all' | 'hour' | 'day' | 'month';

interface SpaceFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedEnvironment: 'all' | 'abierto' | 'cerrado';
  onEnvironmentChange: (env: 'all' | 'abierto' | 'cerrado') => void;
  selectedRateModality: RateFilter;
  onRateModalityChange: (rate: RateFilter) => void;
  selectedCommune: string;
  onCommuneChange: (commune: string) => void;
  maxPriceClp?: number;
  onMaxPriceChange?: (price: number) => void;
  minSurfaceM2: number;
  onMinSurfaceChange: (m2: number) => void;
  onReset: () => void;
}

const CATEGORIES: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'all', label: 'Todos los Espacios', icon: Building },
  { id: 'office', label: 'Oficinas', icon: Building },
  { id: 'cowork', label: 'Coworking', icon: Laptop },
  { id: 'event', label: 'Eventos & Workshops', icon: PartyPopper },
  { id: 'studio', label: 'Estudios Creativos', icon: Camera },
  { id: 'warehouse', label: 'Bodegas Urbanas', icon: Warehouse },
];

const COMMUNES = [
  'Todas las comunas',
  'Las Condes',
  'Providencia',
  'Santiago Centro',
  'Ñuñoa',
  'Vitacura',
  'Lo Barnechea',
  'Macul',
];

export const SpaceFilters: React.FC<SpaceFiltersProps> = ({
  searchTerm,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedEnvironment,
  onEnvironmentChange,
  selectedRateModality,
  onRateModalityChange,
  selectedCommune,
  onCommuneChange,
  minSurfaceM2,
  onMinSurfaceChange,
  onReset,
}) => {
  // Contar filtros activos distintos a los valores por defecto
  const activeFiltersCount = [
    searchTerm.trim() !== '',
    selectedCategory !== 'all',
    selectedEnvironment !== 'all',
    selectedRateModality !== 'all',
    selectedCommune !== 'Todas las comunas',
    minSurfaceM2 > 10,
  ].filter(Boolean).length;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
      {/* 1. FILA SUPERIOR: Búsqueda de texto, Selector de Comuna y Botón de Limpiar Filtros */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Input de Búsqueda */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="search-space-input"
            type="text"
            placeholder="Buscar por nombre, dirección o amenidad (ej. Fibra, Terraza)..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-3 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500 transition shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition cursor-pointer"
              title="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Selector de Comuna */}
        <div className="relative min-w-[200px] md:w-64">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            id="select-commune-filter"
            value={selectedCommune}
            onChange={(e) => onCommuneChange(e.target.value)}
            aria-label="Filtrar por comuna"
            className="w-full pl-10 pr-8 py-3 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500 transition shadow-2xs appearance-none cursor-pointer"
          >
            {COMMUNES.map((commune) => (
              <option key={commune} value={commune}>
                {commune}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs font-bold">
            ▼
          </div>
        </div>

        {/* Botón Restablecer si hay filtros activos */}
        {activeFiltersCount > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-rose-200 shadow-2xs cursor-pointer whitespace-nowrap"
            title="Limpiar todos los filtros"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer ({activeFiltersCount})</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-xs font-medium transition flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpiar</span>
          </button>
        )}
      </div>

      {/* 2. FILA INTERMEDIA: Grid perfectamente alineado de 3 columnas (Modalidad, Entorno, Superficie) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
        {/* Columna A: Modalidad de Tarifa (5 cols) */}
        <div className="md:col-span-5 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-rose-500" />
              Modalidad de Cobro:
            </span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {selectedRateModality === 'all' ? 'Todas' : selectedRateModality === 'hour' ? 'Por Hora' : selectedRateModality === 'day' ? 'Por Día' : 'Por Mes'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'hour', label: 'Por Hora' },
              { id: 'day', label: 'Por Día' },
              { id: 'month', label: 'Por Mes' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onRateModalityChange(item.id as RateFilter)}
                className={`py-1.5 px-1 rounded-lg text-xs font-bold transition text-center cursor-pointer truncate ${
                  selectedRateModality === item.id
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Columna B: Tipo de Entorno (4 cols) */}
        <div className="md:col-span-4 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              Entorno:
            </span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {selectedEnvironment === 'all' ? 'Todos' : selectedEnvironment === 'abierto' ? 'Abierto' : 'Cerrado'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => onEnvironmentChange('all')}
              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition text-center cursor-pointer truncate ${
                selectedEnvironment === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => onEnvironmentChange('abierto')}
              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition text-center cursor-pointer flex items-center justify-center gap-1 truncate ${
                selectedEnvironment === 'abierto'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-amber-800 hover:bg-slate-50'
              }`}
            >
              <Sun className="w-3 h-3 shrink-0" />
              <span className="truncate">Abierto</span>
            </button>
            <button
              type="button"
              onClick={() => onEnvironmentChange('cerrado')}
              className={`py-1.5 px-1 rounded-lg text-xs font-bold transition text-center cursor-pointer flex items-center justify-center gap-1 truncate ${
                selectedEnvironment === 'cerrado'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">Techado</span>
            </button>
          </div>
        </div>

        {/* Columna C: Superficie Mínima (3 cols) */}
        <div className="md:col-span-3 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
              Superficie Mínima:
            </span>
            <span className="text-xs font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
              {minSurfaceM2} m²
            </span>
          </div>

          <div className="py-1 px-1 flex items-center">
            <input
              id="surface-range-slider"
              type="range"
              min="10"
              max="500"
              step="10"
              value={minSurfaceM2}
              onChange={(e) => onMinSurfaceChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* 3. FILA INFERIOR: Categorías de Inmuebles con diseño tipo Pills horizontales elegantes */}
      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs ring-1 ring-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-rose-400' : 'text-slate-500'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
