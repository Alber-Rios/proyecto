import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, animate, useMotionValue, useTransform } from 'motion/react';
import type { Space, SpaceCategory } from '../types.ts';
import { getCategoryInfo } from '../utils/spaceCategories.ts';
import { formatClp } from '../utils/formatters.ts';
import { Check, FileSignature, MousePointer2, Star, Zap } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Actividades que rotan en el titular y la escena que las acompaña.   */
/* ------------------------------------------------------------------ */

export interface HeroScene {
  verb: string;
  categories: SpaceCategory[];
  fallbackTitle: string;
  fallbackCommune: string;
  fallbackPrice: number;
  tint: string; // color del fondo cuando no hay foto
}

export const HERO_SCENES: HeroScene[] = [
  { verb: 'trabajar', categories: ['oficina', 'cowork'], fallbackTitle: 'Oficina privada', fallbackCommune: 'Providencia', fallbackPrice: 8500, tint: 'oklch(0.9 0.03 250)' },
  { verb: 'reunirte', categories: ['sala_reuniones'], fallbackTitle: 'Sala de reuniones', fallbackCommune: 'Las Condes', fallbackPrice: 15000, tint: 'oklch(0.9 0.04 200)' },
  { verb: 'grabar', categories: ['estudio'], fallbackTitle: 'Estudio de grabación', fallbackCommune: 'Ñuñoa', fallbackPrice: 22000, tint: 'oklch(0.88 0.04 300)' },
  { verb: 'atender', categories: ['consulta'], fallbackTitle: 'Box de atención', fallbackCommune: 'Santiago', fallbackPrice: 6000, tint: 'oklch(0.92 0.03 160)' },
  { verb: 'celebrar', categories: ['quincho', 'salon_eventos', 'terreno'], fallbackTitle: 'Quincho con parrilla', fallbackCommune: 'La Reina', fallbackPrice: 18000, tint: 'oklch(0.9 0.06 60)' },
];

const CYCLE_MS = 5600;
const HOURS = Array.from({ length: 12 }, (_, i) => 9 + i); // 09:00 … 20:00
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Patrón de horas ocupadas distinto en cada escena (ilustrativo). */
const busyFor = (i: number) => {
  const patterns = [[0, 1, 6, 7], [2, 3, 9], [0, 4, 5, 10, 11], [1, 2, 8], [0, 1, 2, 7, 8], [3, 4, 10]];
  return new Set(patterns[i % patterns.length]);
};
/** Primer tramo libre de 3 horas. */
const pickRun = (busy: Set<number>) => {
  for (let s = 0; s <= HOURS.length - 3; s++) {
    if (![0, 1, 2].some((k) => busy.has(s + k))) return s;
  }
  return 0;
};

/** Hook compartido: índice de escena que avanza solo. */
export function useHeroScene(count: number) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduce || count < 2) return;
    let id = 0;
    const tick = () => {
      if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % count);
    };
    id = window.setInterval(tick, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [count, reduce]);
  return index;
}

/** Palabra que rota dentro del titular. */
export const RotatingVerb: React.FC<{ verb: string }> = ({ verb }) => {
  const reduce = useReducedMotion();
  return (
    <span className="relative inline-grid align-baseline">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={verb}
          initial={reduce ? false : { y: '0.55em', opacity: 0, filter: 'blur(6px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: '-0.55em', opacity: 0, filter: 'blur(6px)' }}
          transition={{ type: 'spring', duration: 0.6, bounce: 0.15 }}
          className="col-start-1 row-start-1 whitespace-nowrap text-brand-600"
        >
          {verb}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Tarjeta que se reserva sola                                         */
/* ------------------------------------------------------------------ */

type Phase = 'idle' | 'aim' | 'drag' | 'press' | 'done';

const PriceCounter: React.FC<{ value: number }> = ({ value }) => {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => formatClp(Math.round(v / 100) * 100));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.23, 1, 0.32, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className="tabular">{text}</motion.span>;
};

export const HeroBookingDemo: React.FC<{
  scene: HeroScene;
  sceneIndex: number;
  space?: Space;
  onOpen?: (s: Space) => void;
}> = ({ scene, sceneIndex, space, onOpen }) => {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduce ? 'done' : 'idle');

  const busy = useMemo(() => busyFor(sceneIndex), [sceneIndex]);
  const runStart = useMemo(() => pickRun(busy), [busy]);
  const price = space?.pricePerHour || scene.fallbackPrice;
  const title = space?.title || scene.fallbackTitle;
  const commune = space?.commune || scene.fallbackCommune;
  const image = space?.images?.[0];
  const Icon = getCategoryInfo(scene.categories[0]).icon;

  // Coreografía de cada escena: apuntar → arrastrar 3 horas → reservar → confirmado.
  useEffect(() => {
    if (reduce) {
      setPhase('done');
      return;
    }
    setPhase('idle');
    const t = [
      window.setTimeout(() => setPhase('aim'), 650),
      window.setTimeout(() => setPhase('drag'), 1250),
      window.setTimeout(() => setPhase('press'), 2500),
      window.setTimeout(() => setPhase('done'), 3000),
    ];
    return () => t.forEach(window.clearTimeout);
  }, [sceneIndex, reduce]);

  const selectedCount = phase === 'drag' ? 3 : phase === 'press' || phase === 'done' ? 3 : 0;
  const slotPct = 100 / HOURS.length;
  // Posición del puntero (en % del ancho de la tira o sobre el botón).
  const pointer =
    phase === 'idle'
      ? { left: '78%', top: '118%' }
      : phase === 'aim'
        ? { left: `${(runStart + 0.5) * slotPct}%`, top: '55%' }
        : phase === 'drag'
          ? { left: `${(runStart + 2.5) * slotPct}%`, top: '55%' }
          : { left: '82%', top: '330%' };

  return (
    <div className="relative mx-auto w-full max-w-[30rem]">
      {/* Tarjetas de fondo para dar profundidad */}
      <div aria-hidden="true" className="absolute inset-x-8 -bottom-3 top-6 rotate-[3deg] rounded-[1.75rem] bg-slate-100" />
      <div aria-hidden="true" className="absolute inset-x-4 -bottom-1.5 top-3 -rotate-[1.5deg] rounded-[1.75rem] bg-slate-200/70" />

      <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-xl">
        {/* Foto */}
        <button
          type="button"
          disabled={!space || !onOpen}
          onClick={() => space && onOpen?.(space)}
          className="relative block aspect-[16/9] w-full overflow-hidden bg-slate-100 text-left disabled:cursor-default"
          aria-label={space ? `Ver ${space.title}` : undefined}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={sceneIndex}
              initial={reduce ? false : { opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0"
              style={{ background: scene.tint }}
            >
              {image ? (
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Icon className="h-14 w-14 text-slate-900/25" strokeWidth={1.25} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold text-slate-900 shadow-sm">
            <Zap className="h-3 w-3 fill-brand-600 text-brand-600" /> Reserva inmediata
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-slate-950/60 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm">
            Demostración
          </span>
        </button>

        <div className="space-y-4 p-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={sceneIndex}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-slate-950">{title}</p>
                <p className="text-[13px] text-slate-500">
                  {commune} · Hoy · {formatClp(price)} por hora
                </p>
              </div>
              {space && space.rating > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-[13px] text-slate-900 tabular">
                  <Star className="h-3.5 w-3.5 fill-slate-900" />
                  {space.rating.toFixed(1).replace('.', ',')}
                </span>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Tira de horas */}
          <div>
            <div className="mb-1.5 flex justify-between text-[12.5px] text-slate-400 tabular">
              <span>{hh(HOURS[0])}</span>
              <span>{hh(HOURS[HOURS.length - 1] + 1)}</span>
            </div>
            <div className="relative">
              <div className="flex h-9 gap-[3px]">
                {HOURS.map((h, i) => {
                  const isBusy = busy.has(i);
                  const selected = !isBusy && i >= runStart && i < runStart + selectedCount;
                  return (
                    <motion.span
                      key={`${sceneIndex}-${h}`}
                      initial={reduce ? false : { scaleY: 0.3, opacity: 0 }}
                      animate={{ scaleY: 1, opacity: 1 }}
                      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1], delay: i * 0.03 }}
                      className={`relative flex-1 origin-bottom rounded-md transition-colors duration-200 ${
                        isBusy
                          ? 'bg-[repeating-linear-gradient(135deg,var(--color-slate-200)_0_3px,var(--color-slate-100)_3px_6px)]'
                          : selected
                            ? 'bg-brand-600'
                            : 'bg-emerald-100'
                      }`}
                      title={`${hh(h)} · ${isBusy ? 'reservado' : 'libre'}`}
                    />
                  );
                })}
              </div>

              {/* Puntero */}
              {!reduce && (
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute z-10"
                  animate={pointer}
                  transition={{ type: 'spring', duration: phase === 'drag' ? 1.1 : 0.6, bounce: 0 }}
                  style={{ x: '-30%', y: '-20%' }}
                >
                  <motion.span
                    animate={{ scale: phase === 'press' ? 0.82 : 1 }}
                    transition={{ type: 'spring', duration: 0.25, bounce: 0.3 }}
                    className="block"
                  >
                    <MousePointer2 className="h-5 w-5 fill-slate-950 text-white drop-shadow-md" strokeWidth={1.5} />
                  </motion.span>
                </motion.div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[12.5px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[3px] bg-emerald-100 ring-1 ring-emerald-200" />Libre</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[3px] bg-slate-200" />Reservado</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[3px] bg-brand-600" />Tu selección</span>
            </div>
          </div>

          {/* Total y botón */}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="min-w-0">
              <p className="text-[12px] text-slate-500 tabular">
                {selectedCount > 0 ? `${hh(HOURS[runStart])} a ${hh(HOURS[runStart] + 3)} · 3 horas` : 'Elige tus horas'}
              </p>
              <p className="text-[18px] font-semibold text-slate-950">
                <PriceCounter value={selectedCount > 0 ? price * 3 : 0} />
              </p>
            </div>
            <motion.span
              animate={{ scale: phase === 'press' ? 0.95 : 1 }}
              transition={{ type: 'spring', duration: 0.25, bounce: 0.3 }}
              className={`rounded-xl px-5 py-3 text-[14px] font-semibold text-white transition-colors duration-200 ${
                phase === 'done' ? 'bg-emerald-600' : selectedCount > 0 ? 'bg-brand-600' : 'bg-slate-300'
              }`}
            >
              {phase === 'done' ? 'Reservado' : 'Reservar'}
            </motion.span>
          </div>
        </div>

        {/* Confirmación */}
        <AnimatePresence>
          {phase === 'done' && (
            <motion.div
              key={`ok-${sceneIndex}`}
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', duration: 0.5, bounce: 0.25 }}
              className="absolute inset-x-4 top-4 flex items-center gap-3 rounded-2xl bg-slate-950/90 p-3 pr-4 text-white shadow-2xl backdrop-blur-md"
              role="status"
            >
              <motion.span
                initial={reduce ? false : { scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', duration: 0.5, bounce: 0.5, delay: 0.08 }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500"
              >
                <Check className="h-5 w-5" strokeWidth={3} />
              </motion.span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold">Reserva confirmada</span>
                <span className="flex items-center gap-1 text-[12px] text-slate-300">
                  <FileSignature className="h-3 w-3" /> Contrato firmado · pagado con Webpay
                </span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
