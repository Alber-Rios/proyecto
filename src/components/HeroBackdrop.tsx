import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/**
 * Fondo de la portada: fotografías de espacios que se pueden arrendar
 * (salas, oficinas, estudios, lofts), con fundido y un acercamiento lento.
 * Fotos con licencia Unsplash (uso libre); se cargan desde su CDN.
 */

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=2000&q=70`;

const SLIDES = [
  { src: img('photo-1774186184398-1cc2da3d029e'), label: 'Salas de reuniones', credit: 'Marc Wieland' },
  { src: img('photo-1774853107769-c80031c15220'), label: 'Oficinas privadas', credit: 'FlippingBook' },
  { src: img('photo-1786325492140-7353058296ae'), label: 'Estudios de foto y video', credit: 'Neon Wang' },
  { src: img('photo-1785917835430-f1617b7d68ff'), label: 'Lofts para eventos', credit: 'Szcze hoo' },
  { src: img('photo-1687945727613-a4d06cc41024'), label: 'Salas para equipos', credit: 'ASR Design Studio' },
  { src: img('photo-1743419672503-3e363bcd3634'), label: 'Espacios de trabajo compartido', credit: 'rawkkim' },
];

const SLIDE_MS = 7000;

export const HeroBackdrop: React.FC = () => {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [reduce, index]);

  // Precarga la siguiente foto para que el cambio no muestre un hueco.
  useEffect(() => {
    const next = new Image();
    next.src = SLIDES[(index + 1) % SLIDES.length].src;
  }, [index]);

  const slide = SLIDES[index];

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-stone-900">
        <AnimatePresence initial={false}>
          <motion.img
            key={slide.src}
            src={slide.src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0, scale: reduce ? 1 : 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 1.2, ease: [0.4, 0, 0.2, 1] },
              scale: { duration: (SLIDE_MS + 1200) / 1000, ease: 'linear' },
            }}
            decoding="async"
          />
        </AnimatePresence>
        {/* Velos para que el texto se lea sobre cualquier foto */}
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/90 via-stone-950/60 to-stone-950/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-transparent to-stone-950/20" />
      </div>

      {/* Tipo de espacio de la foto actual + avance */}
      <div className="absolute bottom-8 right-10 z-10 hidden items-end gap-4 md:flex">
        <div className="text-right">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={slide.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
              className="text-sm font-semibold text-white"
            >
              {slide.label}
            </motion.p>
          </AnimatePresence>
          <p className="mt-0.5 text-[11px] text-white/60">Foto: {slide.credit} · Unsplash</p>
        </div>
        <div className="flex gap-1.5 pb-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.src}
              type="button"
              aria-label={`Ver foto: ${s.label}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className="relative h-[3px] w-7 cursor-pointer overflow-hidden rounded-full bg-white/25 hover:bg-white/40"
            >
              {i === index && (
                <motion.span
                  key={`${index}-bar`}
                  className="absolute inset-y-0 left-0 rounded-full bg-white"
                  initial={{ width: reduce ? '100%' : '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: reduce ? 0 : SLIDE_MS / 1000, ease: 'linear' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
