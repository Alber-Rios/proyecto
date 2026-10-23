import { useAutoCarousel } from '../hooks/useAutoCarousel.ts';
import { parseOpeningHours } from '../utils/schedule.ts';
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { takeBookingDraft, BookingDraft } from '../utils/bookingDraft.ts';
import { Space, DigitalContract } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut, getSpaceAvailableModalities, getTodayIso, getOffsetDateIso } from '../utils/formatters.ts';
import { BookingModal } from '../components/BookingModal.tsx';
import { ContractModal } from '../components/ContractModal.tsx';
import { SpaceLocationMap } from '../components/SpaceLocationMap.tsx';
import { SpaceReviews } from '../components/SpaceReviews.tsx';
import { ReportDialog } from '../components/ReportDialog.tsx';
import { recordSpaceView } from '../lib/dataAccess.ts';
import { SpaceDetailBookingWidget } from '../components/SpaceDetailBookingWidget.tsx';
import { getCategoryLabel } from '../utils/spaceCategories.ts';
import { motion, AnimatePresence } from 'motion/react';
import { Reveal, EASE_LUXE } from '../components/motion/Motion.tsx';
import { ChevronLeft as GalleryPrev, ChevronRight as GalleryNext } from 'lucide-react';
import {
  MapPin,
  Users,
  Maximize2,
  Clock,
  ShieldCheck,
  Building2,
  Sun,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Share2,
  Heart,
  FileText,
  CreditCard,
  Building,
  ArrowLeft,
  Lock,
  Phone,
  Mail,
  MessageSquare,
  Wifi,
  Coffee,
  Volume2,
  Lightbulb,
  Bath,
  Check,
  CheckCheck,
} from 'lucide-react';

interface SpaceDetailPageProps {
  space: Space | null;
  onNavigate: (view: string) => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}


// Ícono aproximado según el texto de la comodidad.
function amenityIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('wifi') || n.includes('internet')) return Wifi;
  if (n.includes('baño')) return Bath;
  if (n.includes('cocina') || n.includes('café') || n.includes('cafetería')) return Coffee;
  if (n.includes('audio') || n.includes('sonido') || n.includes('parlante')) return Volume2;
  if (n.includes('luz') || n.includes('ilumin') || n.includes('proyector') || n.includes('pantalla')) return Lightbulb;
  if (n.includes('terraza') || n.includes('piscina') || n.includes('patio') || n.includes('parrilla')) return Sun;
  if (n.includes('mesa') || n.includes('silla') || n.includes('mobiliario')) return Users;
  if (n.includes('seguridad') || n.includes('cámara')) return ShieldCheck;
  return CheckCircle2;
}

export const SpaceDetailPage: React.FC<SpaceDetailPageProps> = ({
  space: propSpace,
  onNavigate,
  onOpenAuth,
}) => {
  const { id } = useParams<{ id: string }>();
  const { currentUser, spaces, visitRequests, reservations, isSpaceFavorite, toggleFavoriteSpace } = useApp();

  // Resolver espacio activo
  const space = useMemo(() => {
    if (id) {
      const found = spaces.find((s) => s.id === id);
      if (found) return found;
    }
    if (propSpace) return propSpace;
    return spaces[0] || null;
  }, [propSpace, id, spaces]);

  // Modalidad activa inicial según la publicación del espacio (por_dia, por_hora, mensual)
  const defaultModality = useMemo<'por_hora' | 'por_dia' | 'mensual'>(() => {
    if (!space) return 'por_dia';
    return getSpaceAvailableModalities(space)[0] || 'por_dia';
  }, [space]);

  const [activeModality, setActiveModality] = useState<'por_hora' | 'por_dia' | 'mensual'>(defaultModality);

  // Visita al detalle para el KPI-04 (tasa de conversión).
  useEffect(() => {
    if (space && space.ownerId !== currentUser?.id) {
      recordSpaceView(space.id, currentUser?.id).catch(() => undefined);
    }
  }, [space?.id]);

  useEffect(() => {
    setActiveModality(defaultModality);
  }, [defaultModality]);

  // Estado de fechas y horas (siempre desde hoy en adelante)
  const todayStr = useMemo(() => getTodayIso(), []);
  const tomorrowStr = useMemo(() => getOffsetDateIso(1), []);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr); // Default to same day (1 day) as requested
  const [selectedMonth, setSelectedMonth] = useState('2026-10');
  const [hourStart, setHourStart] = useState(10);
  const [hourEnd, setHourEnd] = useState(11);
  const [intendedUse, setIntendedUse] = useState('');

  // Al abrir un espacio, el arriendo por hora parte en la apertura y con el
  // mínimo de horas del espacio (normalmente 1). El widget luego salta a la
  // primera franja libre si esa ya pasó o está ocupada.
  useEffect(() => {
    if (!space) return;
    const schedule = parseOpeningHours(space.openingHours);
    const minHours = Math.max(1, space.minBookingHours || 1);
    setHourStart(schedule.open);
    setHourEnd(Math.min(schedule.close, schedule.open + minHours));
  }, [space?.id]);

  // Galería de fotos
  // Galería en carrusel: avanza sola cada 4,5 s y se pausa al pasar el cursor o
  // al usar las flechas/miniaturas con el teclado.
  const [galleryPaused, setGalleryPaused] = useState(false);
  const galleryCount = space?.images?.length || 0;
  const { index: activeImageIndex, direction: galleryDirection, go: goToImage, next: nextImage, prev: prevImage, running: galleryRunning } =
    useAutoCarousel(galleryCount, 4500, galleryPaused);
  const setActiveImageIndex = (i: number) => goToImage(i);

  // Modales
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingModalMode, setBookingModalMode] = useState<'booking' | 'visit'>('booking');
  const [bookingModalInitialStep, setBookingModalInitialStep] = useState<1 | 2>(1);
  const [createdContract, setCreatedContract] = useState<DigitalContract | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const isLiked = space ? isSpaceFavorite(space.id) : false;

  // Regreso desde Transbank tras inscribir una tarjeta: se retoma la reserva en el pago.
  const [searchParams, setSearchParams] = useSearchParams();
  const [resumeDraft, setResumeDraft] = useState<BookingDraft | null>(null);
  const [cardNotice, setCardNotice] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!space || space.id !== id || searchParams.get('retomar') !== '1') return;
    const result = searchParams.get('tarjeta');
    const draft = takeBookingDraft(space.id);
    const next = new URLSearchParams(searchParams);
    next.delete('retomar');
    next.delete('tarjeta');
    setSearchParams(next, { replace: true });
    setCardNotice(
      result === 'ok'
        ? { ok: true, text: 'Tarjeta agregada a tu billetera. Ya puedes pagar con ella.' }
        : { ok: false, text: 'No se agregó la tarjeta. Puedes intentarlo de nuevo o pagar con Webpay.' }
    );
    if (draft) {
      setActiveModality(draft.modality);
      setResumeDraft(draft);
      setBookingModalMode('booking');
      setBookingModalInitialStep(draft.signature ? 2 : 1);
      setIsBookingModalOpen(true);
    }
  }, [space?.id, id]);

  // Visita existente si aplica
  const existingVisit = useMemo(() => {
    return visitRequests.find((v) => v.spaceId === space?.id);
  }, [visitRequests, space?.id]);

  if (!space) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <Building className="w-16 h-16 text-slate-300 mx-auto" />
        <h2 className="text-2xl font-bold text-slate-800">Espacio no encontrado</h2>
        <p className="text-xs text-slate-500">
          El espacio que buscas no existe o ha sido pausado por su propietario.
        </p>
        <button
          onClick={() => onNavigate('home')}
          className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al catálogo
        </button>
      </div>
    );
  }

  const imagesList = space.images || [];

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleStartBooking = () => {
    if (!currentUser) {
      if (onOpenAuth) {
        onOpenAuth('login', 'Debes iniciar sesión o registrarte para formalizar tu reserva en este espacio.');
      }
      return;
    }
    const currentToday = getTodayIso();
    if (startDate < currentToday) {
      alert('La fecha seleccionada no puede ser anterior al día de hoy. Hemos ajustado la fecha de inicio a hoy.');
      setStartDate(currentToday);
      return;
    }
    setBookingModalMode('booking');
    setBookingModalInitialStep(1); // Abre directamente el Contrato de Arrendamiento (Paso 1)
    setIsBookingModalOpen(true);
  };

  const handleStartVisit = () => {
    if (!currentUser) {
      if (onOpenAuth) {
        onOpenAuth('login', 'Debes iniciar sesión o registrarte para solicitar una visita al espacio.');
      }
      return;
    }
    setBookingModalMode('visit');
    setBookingModalInitialStep(1);
    setIsBookingModalOpen(true);
  };

  // Precios dinámicos según modalidad
  const rateLabel = activeModality === 'por_hora' ? 'TARIFA POR HORA' : activeModality === 'mensual' ? 'TARIFA MENSUAL' : 'TARIFA POR DÍA';
  const displayPrice = activeModality === 'por_hora' ? (space.pricePerHour || 45000) : activeModality === 'mensual' ? (space.pricePerMonth || 3800000) : space.pricePerDay;
  const unitSuffix = activeModality === 'por_hora' ? '/ hr' : activeModality === 'mensual' ? '/ mes' : '/ día';
  const minHoursLabel = Math.max(1, space.minBookingHours || 1);
  const subRateLabel =
    activeModality === 'por_hora'
      ? `mín. ${minHoursLabel} ${minHoursLabel === 1 ? 'hora' : 'horas'}`
      : activeModality === 'mensual'
      ? space.securityDeposit && space.securityDeposit > 0
        ? `garantía ${formatClp(space.securityDeposit)}`
        : 'sin garantía'
      : 'mín. 1 día';
  const amenities = space.amenities || [];
  const rules = space.rules || [];

  // Título con sufijo cuando es mensual (como en la captura 2)
  const displayTitle = activeModality === 'mensual'
    ? `${space.title} — Modalidad Residencia Permanente`
    : space.title;

  return (
    <div className="space-y-6 sm:space-y-8 pb-20 max-w-7xl mx-auto">
      {/* 1. TOP BREADCRUMB & TAGS (IDÉNTICO A LA REFERENCIA) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1 rounded-full text-[11px] font-extrabold uppercase bg-slate-900 text-white tracking-wider shadow-2xs">
            {getCategoryLabel(space.category)}
          </span>

          <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Espacio verificado</span>
          </span>

          <span className="text-xs text-slate-500 hidden md:inline">
            • {space.address ? `${space.address.split(',')[0]}, ` : ''}{space.commune}
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleShare}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4 text-slate-500" />}
            <span className="text-xs">{copiedLink ? '¡Enlace copiado!' : 'Compartir'}</span>
          </button>

          {currentUser && (
            <button
              type="button"
              onClick={() => toggleFavoriteSpace(space.id)}
              className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                isLiked
                  ? 'bg-rose-50 border-rose-200 text-rose-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-slate-500'}`} />
              <span className="text-xs">{isLiked ? 'Guardado en favoritos' : 'Guardar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. TÍTULO PRINCIPAL Y UBICACIÓN */}
      <Reveal className="space-y-2" y={18}>
        <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl leading-[1.05] text-slate-900 tracking-tight">
          {displayTitle}
        </h1>
        <p className="text-slate-600 text-xs sm:text-sm flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold text-slate-800">{space.address || `${space.commune}, ${space.region}`}</span>
          {space.address && <span className="text-slate-500 hidden sm:inline">• {space.commune}, {space.region}</span>}
        </p>
      </Reveal>

      {/* 3. ESTRUCTURA PRINCIPAL EN DOS COLUMNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* =========================================================
            COLUMNA IZQUIERDA (62% ANCHO): GALERÍA, SPECS, DETALLES,
            AMENIDADES, REGLAS, ANFITRIÓN, CALENDARIO Y MAPA
            ========================================================= */}
        <div className="order-1 lg:order-none lg:col-start-1 lg:row-start-1 lg:col-span-8 space-y-7">
          {/* A. GALERÍA DE FOTOGRAFÍAS */}
          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, ease: EASE_LUXE }}
              onMouseEnter={() => setGalleryPaused(true)}
              onMouseLeave={() => setGalleryPaused(false)}
              onFocusCapture={() => setGalleryPaused(true)}
              onBlurCapture={() => setGalleryPaused(false)}
              aria-roledescription="carrusel"
              aria-label={`Fotos de ${space.title}`}
              className="relative aspect-16/9 sm:aspect-21/10 rounded-[2rem] overflow-hidden bg-stone-950 shadow-[0_40px_80px_-35px_rgba(12,10,9,0.55)] group"
            >
              {imagesList.length > 0 ? (
                <AnimatePresence initial={false} custom={galleryDirection}>
                  <motion.img
                    key={activeImageIndex}
                    src={imagesList[activeImageIndex]}
                    alt={`${space.title} — foto ${activeImageIndex + 1} de ${imagesList.length}`}
                    custom={galleryDirection}
                    variants={{
                      enter: (dir: number) => ({ x: `${dir * 100}%`, opacity: 0.6 }),
                      center: { x: '0%', opacity: 1 },
                      exit: (dir: number) => ({ x: `${dir * -100}%`, opacity: 0.6 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.7, ease: EASE_LUXE }}
                    drag={imagesList.length > 1 ? 'x' : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -60) nextImage();
                      else if (info.offset.x > 60) prevImage();
                    }}
                    className="absolute inset-0 w-full h-full object-cover touch-pan-y"
                  />
                </AnimatePresence>
              ) : <div className="w-full h-full" aria-label="Este espacio no tiene fotografías" />}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/20" />

              {imagesList.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Foto anterior"
                    onClick={prevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-stone-900 shadow-lg backdrop-blur-md transition duration-300 hover:bg-white hover:scale-105 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                  >
                    <GalleryPrev className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Foto siguiente"
                    onClick={nextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-stone-900 shadow-lg backdrop-blur-md transition duration-300 hover:bg-white hover:scale-105 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                  >
                    <GalleryNext className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Badges superiores flotantes */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md text-white text-xs font-bold shadow-md border border-white/10 flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>{space.surfaceM2} m²</span>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md text-white text-xs font-bold shadow-md border border-white/10 flex items-center gap-1.5">
                  {space.spaceEnvironment === 'abierto' ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Building2 className="w-3.5 h-3.5 text-emerald-400" />}
                  <span>{space.spaceEnvironment === 'abierto' ? 'Al aire libre' : 'Techado'}</span>
                </span>
              </div>

              {/* Badge inferior de contador */}
              {imagesList.length > 0 && <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md text-white text-xs font-bold shadow-md border border-white/10" aria-live="polite">
                Fotografía {activeImageIndex + 1} de {imagesList.length}
              </div>}

              {/* Indicadores del carrusel con barra de progreso del avance automático */}
              {imagesList.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
                  {imagesList.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      aria-label={`Ir a la foto ${idx + 1}`}
                      className={`relative h-1.5 rounded-full overflow-hidden bg-white/40 transition-all duration-500 cursor-pointer ${
                        idx === activeImageIndex ? 'w-8' : 'w-1.5 hover:bg-white/70'
                      }`}
                    >
                      {idx === activeImageIndex && (
                        <motion.span
                          key={`${activeImageIndex}-${galleryRunning}`}
                          className="absolute inset-y-0 left-0 bg-white rounded-full"
                          initial={{ width: galleryRunning ? '0%' : '100%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: galleryRunning ? 4.5 : 0, ease: 'linear' }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Miniaturas de la galería */}
            {imagesList.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto no-scrollbar p-1">
                {imagesList.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    aria-label={`Ver foto ${idx + 1}`}
                    aria-current={activeImageIndex === idx}
                    className={`relative w-24 sm:w-28 h-16 sm:h-18 rounded-2xl overflow-hidden shrink-0 transition duration-500 cursor-pointer ${
                      activeImageIndex === idx ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    {activeImageIndex === idx && (
                      <motion.span
                        layoutId="gallery-active-thumb"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-2xl ring-2 ring-inset ring-rose-500"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* B. BARRA DE KEY SPECS (4 FICHAS HORIZONTALES) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                {rateLabel}
              </span>
              <div className="text-lg sm:text-xl font-bold text-rose-600 leading-tight">
                {formatClp(displayPrice)}
                <span className="text-xs font-normal text-slate-500">{unitSuffix}</span>
              </div>
              <span className="text-[10px] text-slate-400 block">{subRateLabel}</span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                CAPACIDAD MÁX
              </span>
              <div className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-1.5 leading-tight">
                <Users className="w-4 h-4 text-slate-400" />
                {space.capacity} pers.
              </div>
              <span className="text-[10px] text-slate-400 block">Capacidad máxima</span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                SUPERFICIE TOTAL
              </span>
              <div className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-1.5 leading-tight">
                <Maximize2 className="w-4 h-4 text-slate-400" />
                {space.surfaceM2} m²
              </div>
              <span className="text-[10px] text-slate-400 block">Superficie aproximada</span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                HORARIO
              </span>
              {(() => {
                const schedule = parseOpeningHours(space.openingHours);
                return (
                  <>
                    <div className="text-sm sm:text-base font-extrabold text-slate-900 flex items-start gap-1.5 leading-tight">
                      <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>{space.openingHours ? schedule.hoursLabel : 'A convenir'}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      {space.openingHours ? schedule.daysLabel : 'Días y horas disponibles'}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>

          {/* C. DESCRIPCIÓN (escrita por el propietario) */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-rose-600" />
              <span>Descripción</span>
            </h2>
            {space.description?.trim() ? (
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">{space.description}</p>
            ) : (
              <p className="text-xs text-slate-500">El propietario aún no agregó una descripción.</p>
            )}
          </div>

          {/* D. COMODIDADES (elegidas por el propietario) */}
          {amenities.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Lo que ofrece este espacio</span>
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {amenities.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {amenities.map((name) => {
                  const IconComponent = amenityIcon(name);
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/90 text-xs font-semibold text-slate-800"
                    >
                      <IconComponent className="w-4 h-4 text-slate-600 shrink-0" />
                      <span>{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* E. REGLAS (definidas por el propietario) */}
          {rules.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <span>Reglas del espacio</span>
              </h2>
              <ul className="bg-rose-50/40 border border-rose-200/80 rounded-2xl p-4 text-xs text-slate-700 space-y-2.5">
                {rules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* F. CONDICIONES DEL ARRIENDO MENSUAL */}
          {activeModality === 'mensual' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span>Condiciones del arriendo mensual</span>
              </h2>
              <ul className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Se cobra por bloques de 30 días desde la fecha de inicio, con contrato digital firmado al reservar.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>
                    {space.securityDeposit && space.securityDeposit > 0
                      ? `El propietario pide una garantía de ${formatClp(space.securityDeposit)}, que se paga una vez al inicio y se devuelve al terminar el arriendo.`
                      : 'El propietario no pide garantía.'}
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="order-2 lg:order-none lg:col-start-9 lg:row-start-1 lg:col-span-4 lg:row-span-2 space-y-6">
          <SpaceDetailBookingWidget
            space={space}
            activeModality={activeModality}
            onModalityChange={setActiveModality}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
            hourStart={hourStart}
            onHourStartChange={setHourStart}
            hourEnd={hourEnd}
            onHourEndChange={setHourEnd}
            intendedUse={intendedUse}
            onIntendedUseChange={setIntendedUse}
            existingVisit={existingVisit}
            onStartBooking={handleStartBooking}
            onStartVisit={handleStartVisit}
            onOpenAuth={onOpenAuth}
          />
        </div>

        <div className="order-3 lg:order-none lg:col-start-1 lg:row-start-2 lg:col-span-8 space-y-7">

          {/* H. FICHA DEL ANFITRIÓN VERIFICADO */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#1e293b] text-white flex items-center justify-center font-bold text-xl shadow-md shrink-0">
                {space.ownerName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900">{space.ownerName}</h3>
                  {space.ownerVerified && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Anfitrión verificado</span>
                    </span>
                  )}
                </div>
                {space.ownerRut && (
                  <p className="text-xs text-slate-500 mt-0.5">RUT: {formatRut(space.ownerRut)}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartVisit}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition shadow-2xs self-start sm:self-auto cursor-pointer"
            >
              Contactar
            </button>
          </div>

          {/* J. UBICACIÓN Y ENTORNO (MAPA ESTILIZADO CON CONECTIVIDAD Y METRO) */}
          <SpaceLocationMap
            address={space.address}
            commune={space.commune}
            region={space.region}
          />

          {/* K. VALORACIONES (RF-29) */}
          <SpaceReviews space={space} onOpenAuth={onOpenAuth} />

          {currentUser && currentUser.id !== space.ownerId && (
            <div className="flex justify-end">
              <ReportDialog targetType="space" targetSpaceId={space.id} targetLabel={space.title} />
            </div>
          )}
        </div>

      </div>

      {/* MODAL DE RESERVA FORMAL Y PAGO */}
      <BookingModal
        space={space}
        isOpen={isBookingModalOpen}
        onClose={() => {
          setIsBookingModalOpen(false);
          setResumeDraft(null);
          setCardNotice(null);
        }}
        initialMode={bookingModalMode}
        initialStep={bookingModalInitialStep}
        initialModality={resumeDraft?.modality ?? activeModality}
        initialStartDate={resumeDraft?.startDate ?? startDate}
        initialEndDate={resumeDraft?.endDate ?? endDate}
        initialIntendedUse={resumeDraft?.intendedUse ?? intendedUse}
        hoursCount={(resumeDraft?.hourEnd ?? hourEnd) - (resumeDraft?.hourStart ?? hourStart)}
        initialHourStart={resumeDraft?.hourStart ?? hourStart}
        initialHourEnd={resumeDraft?.hourEnd ?? hourEnd}
        initialSelectedMonth={resumeDraft?.selectedMonth ?? selectedMonth}
        initialSignature={resumeDraft?.signature ?? null}
        paymentNotice={cardNotice}
        onSuccess={(contract) => {
          setCreatedContract(contract);
          setIsContractModalOpen(true);
        }}
        onOpenAuth={onOpenAuth}
      />

      {/* MODAL DE CONTRATO DIGITAL FIRMADO */}
      <ContractModal
        contract={createdContract}
        isOpen={isContractModalOpen}
        onClose={() => setIsContractModalOpen(false)}
      />
    </div>
  );
};
