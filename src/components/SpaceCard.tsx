import React from 'react';
import { Space } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, getSpaceRateInfo } from '../utils/formatters.ts';
import {
  MapPin,
  Star,
  Users,
  Maximize2,
  ShieldCheck,
  Sun,
  Building2,
  Heart,
} from 'lucide-react';

interface SpaceCardProps {
  space: Space;
  onSelect: (space: Space) => void;
}

const CATEGORY_NAMES: Record<string, string> = {
  office: 'Oficina Privada',
  cowork: 'Coworking Flexible',
  event: 'Salón de Eventos',
  studio: 'Estudio Creativo',
  warehouse: 'Bodega Urbana',
  retail: 'Espacio Comercial',
};

export const SpaceCard: React.FC<SpaceCardProps> = ({ space, onSelect }) => {
  const { currentUser, isSpaceFavorite, toggleFavoriteSpace } = useApp();
  const isFavorite = isSpaceFavorite(space.id);

  return (
    <div
      id={`space-card-${space.id}`}
      onClick={() => onSelect(space)}
      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:border-slate-300 transition-all duration-300 flex flex-col cursor-pointer"
    >
      {/* Imagen Principal con Badges */}
      <div className="relative aspect-4/3 overflow-hidden bg-slate-100">
        <img
          src={space.images[0] || 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80'}
          alt={space.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Botón Favorito (Corazón) - Solo para usuarios registrados */}
        {currentUser && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteSpace(space.id);
            }}
            aria-label={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            title={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-xs transition transform active:scale-90 cursor-pointer shadow-sm ${
              isFavorite
                ? 'bg-white text-rose-600 ring-1 ring-rose-200'
                : 'bg-slate-900/45 hover:bg-white text-white hover:text-rose-600'
            }`}
          >
            <Heart
              className={`w-4 h-4 transition-transform ${
                isFavorite ? 'fill-rose-500 text-rose-500 scale-110' : ''
              }`}
            />
          </button>
        )}

        {/* Categoría & Entorno Badges */}
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/95 backdrop-blur-xs text-slate-800 shadow-xs">
            {CATEGORY_NAMES[space.category] || space.category}
          </span>
          {space.spaceEnvironment === 'abierto' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/95 text-white shadow-xs">
              <Sun className="w-3 h-3" /> Al Aire Libre
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900/90 text-white shadow-xs">
              <Building2 className="w-3 h-3" /> Techado / Interior
            </span>
          )}
          {space.isVerified && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/95 text-white shadow-xs">
              <ShieldCheck className="w-3 h-3" /> Verificado
            </span>
          )}
        </div>

        {/* Rating */}
        {space.rating > 0 && (
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded-lg text-xs font-bold bg-slate-900/80 backdrop-blur-xs text-white flex items-center gap-1 shadow-sm">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{space.rating.toFixed(2)}</span>
            <span className="text-[10px] text-slate-300">({space.reviewsCount})</span>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mb-1">
            <MapPin className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
            <span className="truncate">{space.commune}, {space.region}</span>
          </div>

          <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-rose-600 transition line-clamp-1">
            {space.title}
          </h3>

          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
            {space.description}
          </p>
        </div>

        {/* Capacidad y Superficie */}
        <div className="flex items-center gap-4 text-xs text-slate-600 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>Hasta {space.capacity} personas</span>
          </div>
          <div className="flex items-center gap-1">
            <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            <span>{space.surfaceM2} m²</span>
          </div>
        </div>

        {/* Precio en CLP dinámico según modalidad */}
        <div className="pt-2 flex items-center justify-between">
          <div>
            {(() => {
              const rate = getSpaceRateInfo(space);
              return (
                <div>
                  <span className="text-base font-extrabold text-slate-900">
                    {formatClp(rate.amount)}
                  </span>
                  <span className="text-xs text-slate-500 font-medium"> {rate.unitLabel}</span>
                </div>
              );
            })()}
          </div>

          <button
            type="button"
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 group-hover:bg-rose-600 text-white text-xs font-semibold transition"
          >
            Reservar
          </button>
        </div>
      </div>
    </div>
  );
};
