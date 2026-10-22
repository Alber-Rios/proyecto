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
  Star,
  Zap,
  Hourglass,
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
        <h2 className="text-2xl font-semibold text-slate-800">Espacio no encontrado</h2>
        <p className="text-xs text-slate-500">
          El espacio que buscas no existe o ha sido pausado por su propietario.
        </p>
        <button
          onClick={() => onNavigate('home')}
          className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition inline-flex items-center gap-2 cursor-pointer"
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


  const schedule = parseOpeningHours(space.openingHours);
  const facts = [
    { icon: Users, title: `Hasta ${space.capacity} ${space.capacity === 1 ? 'persona' : 'personas'}`, text: 'Capacidad máxima del espacio' },
    { icon: Maximize2, title: `${space.surfaceM2} m²`, text: 'Superficie aproximada' },
    {
      icon: Clock,
      title: space.openingHours ? schedule.hoursLabel : 'Horario a convenir',
      text: space.openingHours ? schedule.daysLabel : 'Coordina el horario con el anfitrión',
    },
    space.spaceEnvironment === 'abierto'
      ? { icon: Sun, title: 'Al aire libre', text: 'Espacio abierto o con patio' }
      : { icon: Building2, title: 'Interior', text: 'Espacio techado y cerrado' },
  ];
  const sideImages = imagesList.slice(1, 5);

  const modalityLabels = getSpaceAvailableModalities(space)
    .map((m) => (m === 'por_hora' ? 'por hora' : m === 'mensual' ? 'por mes' : 'por día'))
    .join(', ');

  const bookingWidget = (
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
  );

  return (
    <div className="mx-auto max-w-[1180px] pb-28 pt-2 sm:pt-4 lg:pb-16">
      {/* Volver */}
      <button
        type="button"
        onClick={() => onNavigate('home')}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full py-1 pr-2 text-[14px] font-medium text-slate-700 hover:text-slate-950 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" /> Espacios
      </button>

      {/* Título */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1
            className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-slate-950 sm:text-[2.1rem]"
          >
            {space.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] text-slate-700">
            {space.rating > 0 && (
              <>
                <span className="flex items-center gap-1 font-semibold text-slate-950 tabular">
                  <Star className="h-3.5 w-3.5 fill-slate-950" />
                  {space.rating.toFixed(1).replace('.', ',')}
                </span>
                <a href="#resenas" className="underline">
                  {space.reviewsCount} {space.reviewsCount === 1 ? 'reseña' : 'reseñas'}
                </a>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{getCategoryLabel(space.category)}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-500" />
              {space.commune}, {space.region}
            </span>
            {space.isVerified && (
              <>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1 text-brand-700">
                  <ShieldCheck className="h-4 w-4" /> Verificado
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold text-slate-900 underline-offset-4 hover:bg-slate-100 cursor-pointer"
          >
            {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
            <span className="underline">{copiedLink ? 'Enlace copiado' : 'Compartir'}</span>
          </button>
          {currentUser && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => toggleFavoriteSpace(space.id)}
              aria-pressed={isLiked}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-semibold text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <motion.span key={String(isLiked)} initial={{ scale: isLiked ? 0.5 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.4, bounce: 0.5 }}>
                <Heart className={`h-4 w-4 ${isLiked ? 'fill-brand-600 text-brand-600' : ''}`} />
              </motion.span>
              <span className="underline">{isLiked ? 'Guardado' : 'Guardar'}</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Galería: foto principal (carrusel) + mosaico en escritorio */}
      <div className="mt-5 grid gap-2 sm:mt-6 md:grid-cols-4 md:grid-rows-2 md:h-[28rem] lg:h-[30rem]">
        <div
          onMouseEnter={() => setGalleryPaused(true)}
          onMouseLeave={() => setGalleryPaused(false)}
          onFocusCapture={() => setGalleryPaused(true)}
          onBlurCapture={() => setGalleryPaused(false)}
          aria-roledescription="carrusel"
          aria-label={`Fotos de ${space.title}`}
          style={{ viewTransitionName: `space-photo-${space.id}`, viewTransitionClass: 'space-photo' } as React.CSSProperties}
          className={`group relative -mx-4 aspect-[4/3] overflow-hidden bg-slate-100 sm:mx-0 sm:rounded-[1.25rem] md:aspect-auto ${
            sideImages.length > 0 ? 'md:col-span-2 md:row-span-2 md:rounded-r-md' : 'md:col-span-4 md:row-span-2'
          }`}
        >
          {imagesList.length > 0 ? (
            <AnimatePresence initial={false} custom={galleryDirection}>
              <motion.img
                key={activeImageIndex}
                src={imagesList[activeImageIndex]}
                alt={`${space.title} — foto ${activeImageIndex + 1} de ${imagesList.length}`}
                custom={galleryDirection}
                variants={{
                  enter: (dir: number) => ({ x: `${dir * 100}%` }),
                  center: { x: '0%' },
                  exit: (dir: number) => ({ x: `${dir * -30}%`, opacity: 0.5 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', duration: 0.6, bounce: 0 }}
                drag={imagesList.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60) nextImage();
                  else if (info.offset.x > 60) prevImage();
                }}
                className="absolute inset-0 h-full w-full object-cover touch-pan-y"
                draggable={false}
              />
            </AnimatePresence>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400" aria-label="Este espacio no tiene fotografías">
              <Building className="h-10 w-10" strokeWidth={1.25} />
            </div>
          )}

          {imagesList.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Foto anterior"
                onClick={prevImage}
                className="absolute left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md transition-opacity duration-200 hover:bg-white sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
              >
                <GalleryPrev className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Foto siguiente"
                onClick={nextImage}
                className="absolute right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md transition-opacity duration-200 hover:bg-white sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
              >
                <GalleryNext className="h-4 w-4" />
              </button>
              <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
                {imagesList.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    aria-label={`Ir a la foto ${idx + 1}`}
                    className={`relative h-1.5 overflow-hidden rounded-full bg-white/50 transition-[width] duration-300 ease-[var(--ease-out)] cursor-pointer ${
                      idx === activeImageIndex ? 'w-7' : 'w-1.5 hover:bg-white/80'
                    }`}
                  >
                    {idx === activeImageIndex && (
                      <motion.span
                        key={`${activeImageIndex}-${galleryRunning}`}
                        className="absolute inset-y-0 left-0 rounded-full bg-white"
                        initial={{ width: galleryRunning ? '0%' : '100%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: galleryRunning ? 4.5 : 0, ease: 'linear' }}
                      />
                    )}
                  </button>
                ))}
              </div>
              <span className="absolute bottom-3 right-3 z-10 rounded-full bg-slate-950/60 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-sm tabular md:hidden" aria-live="polite">
                {activeImageIndex + 1} / {imagesList.length}
              </span>
            </>
          )}
        </div>

        {sideImages.map((img, k) => {
          const idx = k + 1;
          const corner = k === 1 ? 'md:rounded-tr-[1.25rem]' : k === 3 || (sideImages.length === 2 && k === 1) ? 'md:rounded-br-[1.25rem]' : '';
          return (
            <button
              key={img + idx}
              type="button"
              onClick={() => setActiveImageIndex(idx)}
              aria-label={`Ver foto ${idx + 1}`}
              aria-current={activeImageIndex === idx}
              className={`group/thumb relative hidden overflow-hidden rounded-md bg-slate-100 md:block cursor-pointer ${corner} ${
                sideImages.length < 3 ? 'md:row-span-1 md:col-span-2' : ''
              }`}
            >
              <img src={img} alt="" className="h-full w-full object-cover transition-[transform,filter] duration-500 ease-[var(--ease-out)] group-hover/thumb:scale-[1.04] group-hover/thumb:brightness-95" loading="lazy" />
              {activeImageIndex === idx && (
                <motion.span layoutId="gallery-active-thumb" className="absolute inset-0 ring-[3px] ring-inset ring-white" transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Contenido + reserva */}
      <div className="mt-8 grid grid-cols-1 gap-10 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {/* Anfitrión resumido */}
          <div className="flex items-center justify-between gap-4 pb-7">
            <div className="min-w-0">
              <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-slate-950">
                {getCategoryLabel(space.category)} de {space.ownerName.split(' ')[0]}
              </h2>
              <p className="mt-0.5 text-[15px] text-slate-600 tabular">
                {space.capacity} {space.capacity === 1 ? 'persona' : 'personas'} · {space.surfaceM2} m² · {modalityLabels}
              </p>
            </div>
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[17px] font-semibold text-white">
              {space.ownerName.charAt(0)}
              {space.ownerVerified && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 ring-2 ring-white">
                  <ShieldCheck className="h-3 w-3" />
                </span>
              )}
            </div>
          </div>

          {/* Datos clave */}
          <ul className="grid gap-5 border-y border-slate-200 py-7 sm:grid-cols-2">
            {facts.map((f) => (
              <li key={f.title} className="flex items-start gap-4">
                <f.icon className="mt-0.5 h-6 w-6 shrink-0 text-slate-800" strokeWidth={1.5} />
                <span>
                  <span className="block text-[15px] font-semibold text-slate-950">{f.title}</span>
                  <span className="block text-[14px] text-slate-500">{f.text}</span>
                </span>
              </li>
            ))}
            {space.instantBooking !== false ? (
              <li className="flex items-start gap-4 sm:col-span-2">
                <Zap className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" strokeWidth={1.5} />
                <span>
                  <span className="block text-[15px] font-semibold text-slate-950">Reserva inmediata</span>
                  <span className="block text-[14px] text-slate-500">Tu reserva queda confirmada en cuanto se aprueba el pago.</span>
                </span>
              </li>
            ) : (
              <li className="flex items-start gap-4 sm:col-span-2">
                <Hourglass className="mt-0.5 h-6 w-6 shrink-0 text-slate-800" strokeWidth={1.5} />
                <span>
                  <span className="block text-[15px] font-semibold text-slate-950">El anfitrión aprueba cada solicitud</span>
                  <span className="block text-[14px] text-slate-500">Pagas al reservar y quedas en lista de espera; si no la acepta, se te devuelve el total.</span>
                </span>
              </li>
            )}
          </ul>

          {/* Descripción */}
          <section className="border-b border-slate-200 py-8">
            <h2 className="sr-only">Descripción</h2>
            {space.description?.trim() ? (
              <p className="max-w-[68ch] whitespace-pre-line text-[16px] leading-relaxed text-slate-700">{space.description}</p>
            ) : (
              <p className="text-[15px] text-slate-500">El anfitrión aún no agregó una descripción.</p>
            )}
          </section>

          {/* Comodidades */}
          {amenities.length > 0 && (
            <section className="border-b border-slate-200 py-8">
              <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-slate-950">Lo que ofrece este espacio</h2>
              <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {amenities.map((name) => {
                  const IconComponent = amenityIcon(name);
                  return (
                    <li key={name} className="flex items-center gap-4 text-[15.5px] text-slate-800">
                      <IconComponent className="h-6 w-6 shrink-0 text-slate-700" strokeWidth={1.5} />
                      <span>{name}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Reglas */}
          {rules.length > 0 && (
            <section className="border-b border-slate-200 py-8">
              <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-slate-950">Reglas del espacio</h2>
              <ul className="mt-4 space-y-2.5">
                {rules.map((rule) => (
                  <li key={rule} className="flex items-start gap-3 text-[15.5px] text-slate-700">
                    <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Condiciones del arriendo mensual */}
          {activeModality === 'mensual' && (
            <section className="border-b border-slate-200 py-8">
              <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-slate-950">Condiciones del arriendo mensual</h2>
              <ul className="mt-4 space-y-3 text-[15.5px] text-slate-700">
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>Se cobra por bloques de 30 días desde la fecha de inicio, con contrato digital firmado al reservar.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>
                    {space.securityDeposit && space.securityDeposit > 0
                      ? `El anfitrión pide una garantía de ${formatClp(space.securityDeposit)}, que se paga una vez al inicio y se devuelve al terminar el arriendo.`
                      : 'El anfitrión no pide garantía.'}
                  </span>
                </li>
              </ul>
            </section>
          )}

          {/* Reserva en móvil: aparece aquí, en el flujo */}
          <div className="py-8 lg:hidden" id="reservar">
            {bookingWidget}
          </div>

          {/* Anfitrión */}
          <section className="border-b border-slate-200 py-8 lg:border-t-0">
            <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-slate-950">Conoce al anfitrión</h2>
            <div className="mt-5 flex flex-col gap-5 rounded-[1.25rem] border border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-900 text-2xl font-semibold text-white">
                  {space.ownerName.charAt(0)}
                  {space.ownerVerified && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 ring-2 ring-white">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-[17px] font-semibold text-slate-950">{space.ownerName}</p>
                  <p className="text-[14px] text-slate-500">
                    {space.ownerVerified ? 'Identidad verificada por Spotly' : 'Identidad en verificación'}
                    {space.ownerRut ? ` · RUT ${formatRut(space.ownerRut)}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartVisit}
                className="rounded-xl border border-slate-900 px-5 py-2.5 text-[14.5px] font-semibold text-slate-950 hover:bg-slate-50 cursor-pointer"
              >
                Contactar o agendar visita
              </button>
            </div>
          </section>

          {/* Ubicación */}
          <section className="border-b border-slate-200 py-8">
            <SpaceLocationMap address={space.address} commune={space.commune} region={space.region} />
          </section>

          {/* Reseñas */}
          <section id="resenas" className="scroll-mt-24 py-8">
            <SpaceReviews space={space} onOpenAuth={onOpenAuth} />
          </section>

          {currentUser && currentUser.id !== space.ownerId && (
            <div className="flex justify-start">
              <ReportDialog targetType="space" targetSpaceId={space.id} targetLabel={space.title} />
            </div>
          )}
        </div>

        {/* Columna de reserva fija (escritorio) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">{bookingWidget}</div>
        </aside>
      </div>

      {/* Barra inferior en móvil */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="min-w-0">
          <p className="text-[15px] text-slate-950 tabular">
            <span className="font-semibold">{formatClp(displayPrice)}</span> <span className="text-slate-600">{unitSuffix.replace('/ ', 'por ').replace('hr', 'hora').replace('mes', 'mes')}</span>
          </p>
          <p className="text-[12.5px] text-slate-500">{subRateLabel}</p>
        </div>
        <a
          href="#reservar"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="shrink-0 rounded-xl bg-brand-600 px-6 py-3 text-[15px] font-semibold text-white hover:bg-brand-700"
        >
          Ver horarios
        </a>
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
