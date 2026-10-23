import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/**
 * Fondo de la portada: el plano de un edificio que se dibuja solo, con sus
 * espacios que se marcan como libres o reservados a lo largo del día, y las
 * fotos de los espacios publicados rotando al costado.
 */

type RoomState = 'free' | 'busy';

const ROOMS: { label: string; x: number; y: number; w: number; h: number; outdoor?: boolean }[] = [
  { label: 'Oficina', x: 20, y: 20, w: 200, h: 170 },
  { label: 'Sala de reuniones', x: 220, y: 20, w: 230, h: 170 },
  { label: 'Estudio', x: 450, y: 20, w: 170, h: 230 },
  { label: 'Box', x: 20, y: 190, w: 130, h: 200 },
  { label: 'Cowork', x: 150, y: 250, w: 180, h: 140 },
  { label: 'Bodega', x: 330, y: 250, w: 120, h: 140 },
  { label: 'Quincho', x: 450, y: 250, w: 170, h: 140, outdoor: true },
];

// Cómo va cambiando la ocupación durante el "día" (una fila por momento).
const STATES: RoomState[][] = [
  ['busy', 'free', 'free', 'busy', 'free', 'free', 'busy'],
  ['free', 'busy', 'free', 'busy', 'busy', 'free', 'free'],
  ['free', 'free', 'busy', 'free', 'busy', 'busy', 'free'],
  ['busy', 'free', 'busy', 'free', 'free', 'busy', 'busy'],
];
const HOURS = ['09:00', '11:30', '14:00', '17:30'];
const STEP_MS = 2600;
const PHOTO_MS = 6500;

export const HeroBackdrop: React.FC<{ images: string[] }> = ({ images }) => {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState(0);
  const photos = images.slice(0, 6);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setStep((s) => (s + 1) % STATES.length);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  useEffect(() => {
    if (reduce || photos.length < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setPhoto((p) => (p + 1) % photos.length);
    }, PHOTO_MS);
    return () => window.clearInterval(id);
  }, [reduce, photos.length]);

  const states = STATES[step];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Fotos de los espacios publicados */}
      {photos.length > 0 && (
        <div className="absolute inset-y-0 right-0 w-full lg:w-[62%] [mask-image:linear-gradient(to_left,black_45%,transparent)]">
          <AnimatePresence initial={false}>
            <motion.img
              key={photos[photo]}
              src={photos[photo]}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 1.4 }, scale: { duration: PHOTO_MS / 1000 + 1.4, ease: 'linear' } }}
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-stone-950/70" />
        </div>
      )}

      {/* Plano del edificio */}
      <div className="absolute -right-40 top-1/2 w-[40rem] max-w-none -translate-y-1/2 opacity-25 sm:-right-24 lg:right-8 lg:w-[28rem] lg:opacity-95 xl:right-12 xl:w-[31rem]">
        <svg viewBox="0 0 640 430" className="w-full">
          <defs>
            <pattern id="hero-dots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.08)" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="640" height="430" fill="url(#hero-dots)" />

          {ROOMS.map((r, i) => {
            const free = states[i] === 'free';
            return (
              <g key={r.label}>
                <motion.rect
                  x={r.x + 4}
                  y={r.y + 4}
                  width={r.w - 8}
                  height={r.h - 8}
                  rx="10"
                  initial={false}
                  animate={{
                    fill: free ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.03)',
                    stroke: free ? 'rgba(110,231,183,0.55)' : 'rgba(255,255,255,0.14)',
                  }}
                  transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                  strokeWidth="1.2"
                  strokeDasharray={r.outdoor ? '6 5' : undefined}
                />
                <text
                  x={r.x + 18}
                  y={r.y + 32}
                  fill="rgba(255,255,255,0.72)"
                  style={{ font: '600 13px "Instrument Sans", system-ui, sans-serif' }}
                >
                  {r.label}
                </text>
                <motion.text
                  x={r.x + 18}
                  y={r.y + 50}
                  initial={false}
                  animate={{ fill: free ? 'rgba(110,231,183,0.95)' : 'rgba(255,255,255,0.4)' }}
                  transition={{ duration: 0.6 }}
                  style={{ font: '500 11px "Instrument Sans", system-ui, sans-serif' }}
                >
                  {free ? '● Libre' : 'Reservado'}
                </motion.text>
              </g>
            );
          })}

          {/* Muros: se dibujan al cargar */}
          <motion.path
            d="M20 20 H620 V390 H20 Z M220 20 V190 M450 20 V390 M20 190 H220 M150 190 V390 M150 250 H450 M330 250 V390 M450 250 H620"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2.4, ease: [0.65, 0, 0.35, 1] }}
          />
          {/* Puerta de entrada */}
          <rect x="268" y="386" width="40" height="8" fill="#0c0a09" />
        </svg>

        {/* Hora del día que avanza */}
        <div className="absolute right-4 -top-10 hidden items-center lg:flex gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm sm:right-10">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Disponibilidad en vivo ·
          <span className="relative inline-block w-[2.6rem] tabular-nums">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={HOURS[step]}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="inline-block"
              >
                {HOURS[step]}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
      </div>

      {/* Oscurece el lado del texto para que se lea bien */}
      <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/80 to-transparent lg:via-stone-950/60" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-stone-950/80 to-transparent" />
    </div>
  );
};
