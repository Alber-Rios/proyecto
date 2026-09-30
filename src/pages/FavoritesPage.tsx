import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { Space, SpaceCategory } from '../types.ts';
import { SpaceCard } from '../components/SpaceCard.tsx';
import {
  Heart,
  Search,
  Sparkles,
  Trash2,
  ArrowRight,
  SlidersHorizontal,
  Building2,
} from 'lucide-react';

interface FavoritesPageProps {
  onNavigate: (view: string) => void;
  onSelectSpace: (space: Space) => void;
}

const CATEGORY_FILTERS: { id: 'all' | SpaceCategory; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'office', label: 'Oficinas' },
  { id: 'cowork', label: 'Coworking' },
  { id: 'event', label: 'Eventos' },
  { id: 'studio', label: 'Estudios' },
  { id: 'warehouse', label: 'Bodegas' },
  { id: 'retail', label: 'Comercial' },
];

export const FavoritesPage: React.FC<FavoritesPageProps> = ({
  onNavigate,
  onSelectSpace,
}) => {
  const { currentUser, spaces, favoriteSpaceIds, clearFavorites } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<'all' | SpaceCategory>('all');
  const [sortBy, setSortBy] = useState<'saved' | 'price_asc' | 'rating_desc'>('saved');

  // Obtener lista de espacios guardados respetando el orden en que se guardaron
  const favoriteSpaces = useMemo(() => {
    const list = favoriteSpaceIds
      .map((id) => spaces.find((s) => s.id === id))
      .filter((s): s is Space => Boolean(s));

    const filtered =
      selectedCategory === 'all'
        ? list
        : list.filter((s) => s.category === selectedCategory);

    if (sortBy === 'price_asc') {
      return [...filtered].sort((a, b) => a.pricePerDay - b.pricePerDay);
    }
    if (sortBy === 'rating_desc') {
      return [...filtered].sort((a, b) => b.rating - a.rating);
    }
    return filtered;
  }, [spaces, favoriteSpaceIds, selectedCategory, sortBy]);

  // Sugerencias si no tiene favoritos aún
  const suggestedSpaces = useMemo(() => {
    return spaces
      .filter((s) => s.status === 'active' && !favoriteSpaceIds.includes(s.id))
      .slice(0, 3);
  }, [spaces, favoriteSpaceIds]);

  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
            <Heart className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Inicia sesión para ver tus favoritos
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              La lista de espacios favoritos está disponible exclusivamente para usuarios registrados en Spotly Chile.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              Registrarte Gratis
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Cabecera de Mis Favoritos */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-7 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600">
              <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
              <span>Colección Personal</span>
              <span aria-hidden="true">·</span>
              <span>{favoriteSpaceIds.length} {favoriteSpaceIds.length === 1 ? 'espacio guardado' : 'espacios guardados'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Mis Lugares Favoritos
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
              Guarda y compara tus oficinas, estudios y salones preferidos en Chile para reservarlos cuando estés listo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-center">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>Explorar más espacios</span>
            </button>

            {favoriteSpaceIds.length > 0 && (
              <button
                type="button"
                onClick={clearFavorites}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50/60 text-slate-600 hover:text-rose-600 text-xs font-semibold transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar lista</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Filtros y Ordenamiento (visible cuando hay favoritos) */}
        {favoriteSpaceIds.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Categorías con scroll horizontal en móvil */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              {CATEGORY_FILTERS.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      active
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Selector de Orden */}
            <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">Ordenar por:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-rose-500 cursor-pointer"
              >
                <option value="saved">Guardados recientemente</option>
                <option value="price_asc">Menor precio por día</option>
                <option value="rating_desc">Mejor calificación</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Contenido Principal: Grilla de Favoritos o Estado Vacío */}
      {favoriteSpaceIds.length === 0 ? (
        <div className="space-y-10">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
              <Heart className="w-7 h-7" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Aún no tienes espacios en tu lista de favoritos
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
              Toca el ícono del corazón en cualquier oficina, coworking, estudio o salón de eventos para guardarlo aquí y revisarlo cuando quieras.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold shadow-sm transition cursor-pointer"
              >
                <span>Descubrir espacios disponibles</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Espacios Recomendados para Empezar */}
          {suggestedSpaces.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Espacios destacados que podrían interesarte
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  Ver catálogo completo
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {suggestedSpaces.map((space) => (
                  <SpaceCard
                    key={space.id}
                    space={space}
                    onSelect={onSelectSpace}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : favoriteSpaces.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-800">
            No tienes favoritos en esta categoría
          </p>
          <p className="text-xs text-slate-500">
            Prueba seleccionando &ldquo;Todos&rdquo; para ver tus demás espacios guardados.
          </p>
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
          >
            Mostrar todos mis favoritos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {favoriteSpaces.map((space) => (
            <SpaceCard
              key={space.id}
              space={space}
              onSelect={onSelectSpace}
            />
          ))}
        </div>
      )}
    </div>
  );
};
