import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Space, DigitalContract } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { SpaceCard } from '../components/SpaceCard.tsx';
import { HeroBookingDemo, HERO_SCENES, RotatingVerb, useHeroScene } from '../components/HeroBookingDemo.tsx';
import {
  HeroSearch,
  CategoryRail,
  FilterButton,
  countActiveFilters,
  ALL_COMMUNES,
  SURFACE_DEFAULT,
  type RateFilter,
  type EnvironmentFilter,
} from '../components/SpaceFilters.tsx';
import { getSpaceAvailableModalities } from '../utils/formatters.ts';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Building2, ArrowRight, Compass, CalendarClock, FileSignature, CreditCard, ChevronDown } from 'lucide-react';

const BookingModal = lazy(() => import('../components/BookingModal.tsx').then((m) => ({ default: m.BookingModal })));
const ContractModal = lazy(() => import('../components/ContractModal.tsx').then((m) => ({ default: m.ContractModal })));

interface HomePageProps {
  onOpenOwnerUpgrade: () => void;
  onNavigate: (view: string) => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
  onSelectSpace?: (space: Space) => void;
}

type SortId = 'recent' | 'price-asc' | 'price-desc' | 'rating';
const SORTS: { id: SortId; label: string }[] = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'rating', label: 'Mejor evaluados' },
  { id: 'price-asc', label: 'Precio: menor a mayor' },
  { id: 'price-desc', label: 'Precio: mayor a menor' },
];

const rateUnitOf = (space: Space): RateFilter =>
  space.priceUnit || (space.rentalModality === 'por_hora' ? 'hour' : space.rentalModality === 'mensual' ? 'month' : 'day');

const supportsRate = (space: Space, rate: RateFilter) => {
  if (rate === 'all') return true;
  const mods = getSpaceAvailableModalities(space);
  const map = { hour: 'por_hora', day: 'por_dia', month: 'mensual' } as const;
  return mods.includes(map[rate]) || rateUnitOf(space) === rate;
};

const priceFor = (space: Space, rate: RateFilter) => {
  if (rate === 'hour') return space.pricePerHour || Infinity;
  if (rate === 'month') return space.pricePerMonth || Infinity;
  if (rate === 'day') return space.pricePerDay || Infinity;
  const unit = rateUnitOf(space);
  return unit === 'hour' ? space.pricePerHour || 0 : unit === 'month' ? space.pricePerMonth || 0 : space.pricePerDay;
};

const PROMISES = [
  { icon: CalendarClock, title: 'Disponibilidad en vivo', text: 'Cada espacio muestra las horas libres de hoy, actualizadas al instante.' },
  { icon: FileSignature, title: 'Contrato en cada reserva', text: 'Firmas digitalmente las condiciones antes de pagar; queda en tu cuenta.' },
  { icon: CreditCard, title: 'Pago protegido con Webpay', text: 'Si el anfitrión no acepta tu solicitud, se te devuelve el total.' },
];

export const HomePage: React.FC<HomePageProps> = ({ onOpenOwnerUpgrade, onNavigate, onOpenAuth, onSelectSpace }) => {
  const { spaces, currentUser } = useApp();
  const reduce = useReducedMotion();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [environment, setEnvironment] = useState<EnvironmentFilter>('all');
  const [rate, setRate] = useState<RateFilter>('all');
  const [commune, setCommune] = useState(ALL_COMMUNES);
  const [minSurfaceM2, setMinSurfaceM2] = useState(SURFACE_DEFAULT);
  const [instantOnly, setInstantOnly] = useState(false);
  const [sort, setSort] = useState<SortId>('recent');

  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [createdContract, setCreatedContract] = useState<DigitalContract | null>(null);
  const [isContractOpen, setIsContractOpen] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);
  const [railStuck, setRailStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setRailStuck(!e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const activeSpaces = useMemo(() => spaces.filter((s) => s.status === 'active'), [spaces]);
  const communes = useMemo(() => [...new Set(activeSpaces.map((s) => s.commune))].sort((a, b) => a.localeCompare(b, 'es')), [activeSpaces]);
  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of activeSpaces) m[s.category] = (m[s.category] || 0) + 1;
    return m;
  }, [activeSpaces]);

  const filteredSpaces = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = activeSpaces.filter((space) => {
      if (term) {
        const hay = [space.title, space.address, space.commune, space.description, ...space.amenities].join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (selectedCategory !== 'all' && space.category !== selectedCategory) return false;
      if (environment !== 'all' && space.spaceEnvironment !== environment) return false;
      if (commune !== ALL_COMMUNES && space.commune !== commune) return false;
      if (!supportsRate(space, rate)) return false;
      if (space.surfaceM2 < minSurfaceM2) return false;
      if (instantOnly && space.instantBooking === false) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === 'rating') sorted.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount);
    if (sort === 'price-asc') sorted.sort((a, b) => priceFor(a, rate) - priceFor(b, rate));
    if (sort === 'price-desc') sorted.sort((a, b) => priceFor(b, rate) - priceFor(a, rate));
    return sorted;
  }, [activeSpaces, searchTerm, selectedCategory, environment, commune, rate, minSurfaceM2, instantOnly, sort]);

  const handleSelectSpace = (space: Space) => {
    setSelectedSpace(space);
    if (onSelectSpace) onSelectSpace(space);
    else setIsBookingOpen(true);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setEnvironment('all');
    setRate('all');
    setCommune(ALL_COMMUNES);
    setMinSurfaceM2(SURFACE_DEFAULT);
    setInstantOnly(false);
  };

  const handlePublishSpace = () => {
    if (!currentUser) onOpenAuth?.('register', 'Crea tu cuenta para publicar y administrar un espacio.');
    else onOpenOwnerUpgrade();
  };

  const scrollToResults = () => {
    resultsRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  // Escena del titular: rota la actividad y la tarjeta de demostración usa un
  // espacio real de esa categoría cuando existe.
  const sceneIndex = useHeroScene(HERO_SCENES.length);
  const scene = HERO_SCENES[sceneIndex];
  const sceneSpace = useMemo(
    () =>
      activeSpaces
        .filter((s) => scene.categories.includes(s.category) && Boolean(s.pricePerHour))
        .sort((a, b) => b.rating - a.rating)[0],
    [activeSpaces, scene]
  );

  const activeFilterCount = countActiveFilters({ environment, rate, minSurfaceM2, instantOnly });
  const placeLabel = commune === ALL_COMMUNES ? 'en Chile' : `en ${commune}`;

  return (
    <div className="pb-8">
      {/* Portada: titular + buscador funcional */}
      <section className="relative pt-6 pb-8 sm:pt-10 sm:pb-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 [&>*]:min-w-0">
        <div className="max-w-3xl">
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.045em] text-slate-950 sm:text-[4.2rem]"
          >
            <span className="sr-only">Un espacio para trabajar, reunirte, grabar, atender o celebrar, libre hoy.</span>
            <span aria-hidden="true">
              Un espacio para
              <br />
              <RotatingVerb verb={scene.verb} />
              <br />
              <span className="text-slate-400">libre hoy.</span>
            </span>
          </motion.h1>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.06 }}
            className="mt-4 max-w-xl text-[17px] leading-relaxed text-slate-600"
          >
            Oficinas, salas, estudios, casas y cabañas en todo Chile. Mira qué horas quedan libres y reserva por hora, día o mes.
          </motion.p>
          <ul className="mt-7 hidden space-y-2.5 text-[14px] text-slate-600 sm:block">
            {PROMISES.map((p) => (
              <li key={p.title} className="flex items-start gap-2.5">
                <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>
                  <span className="font-medium text-slate-900">{p.title}.</span> {p.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1], delay: 0.15 }}
          className="hidden sm:block"
        >
          <HeroBookingDemo scene={scene} sceneIndex={sceneIndex} space={sceneSpace} onOpen={handleSelectSpace} />
        </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1], delay: 0.12 }}
          className="mt-10"
        >
          <HeroSearch
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            commune={commune}
            communes={communes}
            onCommuneChange={setCommune}
            rate={rate}
            onRateChange={setRate}
            onSubmit={scrollToResults}
          />
        </motion.div>
        <div className="mt-10 sm:hidden">
          <HeroBookingDemo scene={scene} sceneIndex={sceneIndex} space={sceneSpace} onOpen={handleSelectSpace} />
        </div>


      </section>

      <div ref={sentinel} aria-hidden="true" />

      {/* Riel de categorías fijo bajo el encabezado */}
      <div
        ref={resultsRef}
        className={`sticky top-14 sm:top-[3.75rem] z-30 -mx-4 scroll-mt-14 border-b bg-white/95 px-4 backdrop-blur-xl transition-[box-shadow,border-color] duration-300 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 ${
          railStuck ? 'border-slate-200 shadow-[0_6px_16px_-12px_oklch(0.2_0.02_265/0.25)]' : 'border-slate-200/70'
        }`}
      >
        <div className="flex items-center gap-4 pt-2">
          <div className="min-w-0 flex-1">
            <CategoryRail selected={selectedCategory} onChange={setSelectedCategory} counts={categoryCounts} />
          </div>
          <div className="hidden pb-2 sm:block">
            <FilterButton
              environment={environment}
              onEnvironmentChange={setEnvironment}
              rate={rate}
              onRateChange={setRate}
              minSurfaceM2={minSurfaceM2}
              onMinSurfaceChange={setMinSurfaceM2}
              instantOnly={instantOnly}
              onInstantOnlyChange={setInstantOnly}
              activeCount={activeFilterCount}
              resultCount={filteredSpaces.length}
              onReset={handleResetFilters}
            />
          </div>
        </div>
      </div>

      {/* Resultados */}
      <section id="espacios" aria-labelledby="results-title" className="pt-6 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-title" className="text-[17px] font-semibold text-slate-950 tabular">
            {filteredSpaces.length} {filteredSpaces.length === 1 ? 'espacio' : 'espacios'} {placeLabel}
          </h2>
          <div className="flex items-center gap-2">
            <div className="sm:hidden">
              <FilterButton
                environment={environment}
                onEnvironmentChange={setEnvironment}
                rate={rate}
                onRateChange={setRate}
                minSurfaceM2={minSurfaceM2}
                onMinSurfaceChange={setMinSurfaceM2}
                instantOnly={instantOnly}
                onInstantOnlyChange={setInstantOnly}
                activeCount={activeFilterCount}
                resultCount={filteredSpaces.length}
                onReset={handleResetFilters}
              />
            </div>
            <label className="relative flex items-center">
              <span className="sr-only">Ordenar por</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortId)}
                className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-9 text-[13px] font-semibold text-slate-800 hover:border-slate-400 cursor-pointer"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500" />
            </label>
          </div>
        </div>

        {activeSpaces.length === 0 ? (
          <div className="rounded-3xl bg-slate-50 px-6 py-16 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-400" strokeWidth={1.5} />
            <h3 className="mt-4 text-lg font-semibold text-slate-950">Todavía no hay espacios publicados</h3>
            <p className="mx-auto mt-1.5 max-w-md text-[15px] text-slate-600">
              Cuando los anfitriones publiquen sus espacios, aparecerán aquí con su disponibilidad del día.
            </p>
            <button
              onClick={handlePublishSpace}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-[14px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              Publica el primero <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : filteredSpaces.length === 0 ? (
          <div className="rounded-3xl bg-slate-50 px-6 py-16 text-center">
            <Compass className="mx-auto h-8 w-8 text-slate-400" strokeWidth={1.5} />
            <h3 className="mt-4 text-lg font-semibold text-slate-950">Ningún espacio calza con tu búsqueda</h3>
            <p className="mx-auto mt-1.5 max-w-md text-[15px] text-slate-600">
              Prueba con otra comuna u otra modalidad, o quita algunos filtros.
            </p>
            <button
              onClick={handleResetFilters}
              className="mt-6 rounded-xl border border-slate-950 px-5 py-3 text-[14px] font-semibold text-slate-950 hover:bg-white cursor-pointer"
            >
              Quitar filtros
            </button>
          </div>
        ) : (
          <motion.div layout={!reduce} className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredSpaces.map((space, i) => (
                <motion.div
                  key={space.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1], delay: Math.min(i, 8) * 0.04 }}
                >
                  <SpaceCard space={space} onSelect={handleSelectSpace} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" aria-labelledby="como-funciona-title" className="mt-24 scroll-mt-28 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <h2 id="como-funciona-title" className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
            Reservar toma tres pasos
          </h2>
          <p className="mt-3 max-w-md text-[16px] leading-relaxed text-slate-600">
            Sin llamadas ni idas y vueltas por correo. Todo queda registrado en tu cuenta.
          </p>
          <ol className="mt-8 space-y-0">
            {[
              ['Elige el horario', 'Las horas libres se ven en la ficha y en cada tarjeta. Marca las que necesitas, respetando el horario del espacio.'],
              ['Firma y paga', 'Revisas el contrato, lo firmas desde el navegador y pagas con Webpay o una tarjeta guardada.'],
              ['Llega y úsalo', 'Si el espacio tiene reserva inmediata, queda confirmado al tiro. Si no, el anfitrión responde y te avisamos.'],
            ].map(([t, d], i, arr) => (
              <li key={t} className="relative flex gap-5 pb-8 last:pb-0">
                {i < arr.length - 1 && <span className="absolute left-[15px] top-9 bottom-1 w-px bg-slate-200" aria-hidden="true" />}
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[13px] font-semibold text-slate-900 tabular">
                  {i + 1}
                </span>
                <div className="pt-1">
                  <h3 className="text-[16px] font-semibold text-slate-950">{t}</h3>
                  <p className="mt-1 max-w-md text-[15px] leading-relaxed text-slate-600">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-8 text-white sm:p-12 self-start">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-600/40 blur-3xl"
          />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">¿Tienes un espacio que pasa vacío?</h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-slate-300">
              Publícalo por hora, día o mes. Tú defines el horario, los bloqueos y si apruebas cada solicitud o aceptas reservas inmediatas.
            </p>
            <ul className="mt-6 space-y-2.5 text-[15px] text-slate-200">
              <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />Panel con solicitudes, calendario y reportes de ingresos.</li>
              <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />Arrendatarios con identidad verificada y contrato firmado.</li>
              <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />Cobros con Webpay y el detalle de cada pago en tu panel.</li>
            </ul>
            <button
              type="button"
              onClick={handlePublishSpace}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[15px] font-semibold text-slate-950 hover:bg-slate-100 cursor-pointer"
            >
              Publica tu espacio <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        {isBookingOpen && (
          <BookingModal
            space={selectedSpace}
            isOpen={isBookingOpen}
            onClose={() => setIsBookingOpen(false)}
            onSuccess={(contract) => {
              setCreatedContract(contract);
              setIsContractOpen(true);
            }}
            onOpenAuth={onOpenAuth}
          />
        )}
        {isContractOpen && (
          <ContractModal contract={createdContract} isOpen={isContractOpen} onClose={() => setIsContractOpen(false)} />
        )}
      </Suspense>
    </div>
  );
};
