import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAutoCarousel } from '../hooks/useAutoCarousel.ts';
import { useTodayAvailability, type TodayAvailability } from '../hooks/useTodayAvailability.ts';
import { Space } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, getSpaceRateInfo } from '../utils/formatters.ts';
import { getCategoryLabel } from '../utils/spaceCategories.ts';
import { Star, Heart, Zap, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';

interface SpaceCardProps {
  space: Space;
  onSelect: (space: Space) => void;
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Tira de horas de hoy: verde libre, gris ocupado, tenue ya pasó. */
export const TodayStrip: React.FC<{ a: TodayAvailability }> = ({ a }) => {
  if (a.loading) {
    return <div className="h-[22px] rounded-md bg-slate-100 animate-pulse" aria-hidden="true" />;
  }
  if (!a.hourly) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-slate-600">
        <span className={`h-1.5 w-1.5 rounded-full ${a.freeToday ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
        {a.freeToday ? 'Disponible desde hoy' : 'Ocupado hoy · revisa otras fechas'}
      </p>
    );
  }
  if (a.closedToday) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden="true" />
        Cerrado por hoy · reserva para otro día
      </p>
    );
  }
  const freeCount = a.hours.filter((h) => h.state === 'free').length;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        {a.freeNow ? (
          <span className="flex items-center gap-1.5 font-medium text-emerald-700">
            <span className="live-dot" aria-hidden="true" /> Libre ahora
          </span>
        ) : a.nextFreeHour != null ? (
          <span className="font-medium text-slate-700">Libre desde las {hh(a.nextFreeHour)}</span>
        ) : (
          <span className="font-medium text-slate-500">Sin horas libres hoy</span>
        )}
        <span className="text-slate-500 tabular">
          {freeCount} {freeCount === 1 ? 'hora libre' : 'horas libres'} hoy
        </span>
      </div>
      <div
        className="flex h-[6px] gap-[2px]"
        role="img"
        aria-label={`Hoy: ${freeCount} horas libres entre ${hh(a.hours[0].hour)} y ${hh(a.hours[a.hours.length - 1].hour + 1)}`}
      >
        {a.hours.map((h, i) => (
          <span
            key={h.hour}
            title={`${hh(h.hour)} · ${h.state === 'free' ? 'libre' : h.state === 'busy' ? 'ocupado' : 'ya pasó'}`}
            style={{ animationDelay: `${i * 18}ms` }}
            className={`flex-1 rounded-full animate-slot-in origin-bottom ${
              h.state === 'free' ? 'bg-emerald-500' : h.state === 'busy' ? 'bg-slate-300' : 'bg-slate-100'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export const SpaceCard: React.FC<SpaceCardProps> = ({ space, onSelect }) => {
  const { currentUser, isSpaceFavorite, toggleFavoriteSpace } = useApp();
  const isFavorite = isSpaceFavorite(space.id);
  const images = space.images || [];
  const [hovering, setHovering] = useState(false);
  // Las fotos rotan solas mientras el cursor (o el foco) está sobre la tarjeta.
  const { index: photoIndex, direction, go: goToPhoto } = useAutoCarousel(images.length, 2400, !hovering);
  const { ref, availability } = useTodayAvailability<HTMLDivElement>(space);
  const rate = getSpaceRateInfo(space);
  const unit = rate.unitLabel.replace(' • Flexible', '').replace('/ ', '');

  const select = () => onSelect(space);

  return (
    <div
      ref={ref}
      id={`space-card-${space.id}`}
      role="link"
      tabIndex={0}
      aria-label={`Ver ${space.title}`}
      onClick={select}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false);
        goToPhoto(0);
      }}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      }}
      className="group relative flex h-full flex-col gap-3 rounded-[1.4rem] cursor-pointer outline-offset-4"
    >
      {/* Foto */}
      <div
        className="relative aspect-[20/19] overflow-hidden rounded-[1.25rem] bg-slate-100"
        style={{ viewTransitionName: `space-photo-${space.id}`, viewTransitionClass: 'space-photo' } as React.CSSProperties}
      >
        {images.length > 0 ? (
          <AnimatePresence initial={false} custom={direction}>
            <motion.img
              key={photoIndex}
              src={images[photoIndex]}
              alt={space.title}
              custom={direction}
              variants={{
                enter: (d: number) => ({ x: d >= 0 ? '100%' : '-100%' }),
                center: { x: 0 },
                exit: (d: number) => ({ x: d >= 0 ? '-30%' : '30%', opacity: 0.6 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', duration: 0.55, bounce: 0 }}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.03]"
              loading="lazy"
              draggable={false}
            />
          </AnimatePresence>
        ) : (
          <div className="h-full w-full" aria-label="Este espacio no tiene imágenes" />
        )}

        {/* Flechas (solo puntero fino) */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={(e) => {
                e.stopPropagation();
                goToPhoto((photoIndex - 1 + images.length) % images.length);
              }}
              className="absolute left-2.5 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100 hover:bg-white [@media(pointer:fine)]:flex cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Foto siguiente"
              onClick={(e) => {
                e.stopPropagation();
                goToPhoto((photoIndex + 1) % images.length);
              }}
              className="absolute right-2.5 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100 hover:bg-white [@media(pointer:fine)]:flex cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1" aria-hidden="true">
              {images.slice(0, 5).map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ease-[var(--ease-out)] ${
                    idx === photoIndex ? 'w-1.5 bg-white scale-125' : 'w-1.5 bg-white/60'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Sello superior */}
        <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
          {space.instantBooking !== false ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold text-slate-900 shadow-sm">
              <Zap className="h-3 w-3 fill-brand-600 text-brand-600" /> Reserva inmediata
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold text-slate-900 shadow-sm">
              Con aprobación
            </span>
          )}
        </div>

        {/* Favorito */}
        {currentUser && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavoriteSpace(space.id);
            }}
            aria-label={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            aria-pressed={isFavorite}
            className="absolute right-2.5 top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-full cursor-pointer"
          >
            <motion.span
              key={String(isFavorite)}
              initial={{ scale: isFavorite ? 0.6 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0.45 }}
            >
              <Heart
                className={`h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${
                  isFavorite ? 'fill-brand-600 text-white' : 'fill-slate-900/35 text-white'
                }`}
                strokeWidth={2}
              />
            </motion.span>
          </motion.button>
        )}
      </div>

      {/* Datos */}
      <div className="flex flex-1 flex-col gap-1 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-[15px] font-semibold leading-snug text-slate-950">{space.title}</h3>
          {space.rating > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-[13.5px] text-slate-900 tabular">
              <Star className="h-3.5 w-3.5 fill-slate-900 text-slate-900" />
              {space.rating.toFixed(1).replace('.', ',')}
              <span className="text-slate-500">({space.reviewsCount})</span>
            </span>
          )}
        </div>
        <p className="flex items-center gap-1 text-[13.5px] text-slate-500">
          <span className="truncate">
            {getCategoryLabel(space.category)} · {space.commune}
          </span>
          {space.isVerified && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-label="Espacio verificado" />}
        </p>
        <p className="text-[13.5px] text-slate-500 tabular">
          Hasta {space.capacity} {space.capacity === 1 ? 'persona' : 'personas'} · {space.surfaceM2} m²
        </p>
        <p className="mt-0.5 text-[15px] text-slate-950 tabular">
          <span className="font-semibold">{formatClp(rate.amount)}</span>
          <span className="text-slate-600"> {unit === 'hr' ? 'por hora' : unit === 'día' ? 'por día' : 'al mes'}</span>
        </p>
        <div className="mt-2 border-t border-slate-100 pt-2.5">
          <TodayStrip a={availability} />
        </div>
      </div>
    </div>
  );
};
