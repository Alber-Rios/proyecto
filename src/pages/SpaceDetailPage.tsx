import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Space, DigitalContract } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut, getSpaceAvailableModalities, getTodayIso, getOffsetDateIso } from '../utils/formatters.ts';
import { BookingModal } from '../components/BookingModal.tsx';
import { ContractModal } from '../components/ContractModal.tsx';
import { SpaceLocationMap } from '../components/SpaceLocationMap.tsx';
import { SpaceDetailBookingWidget } from '../components/SpaceDetailBookingWidget.tsx';
import {
  MapPin,
  Users,
  Maximize2,
  Clock,
  ShieldCheck,
  Building2,
  Sun,
  Sparkles,
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

const CATEGORY_NAMES: Record<string, string> = {
  office: 'Oficina Privada & Residencia',
  cowork: 'Coworking Ejecutivo',
  event: 'Eventos & Workshops',
  studio: 'Estudio Creativo',
  warehouse: 'Bodega Urbana',
  retail: 'Local Comercial',
};

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
  const [hourEnd, setHourEnd] = useState(14);
  const [intendedUse, setIntendedUse] = useState('');

  // Galería de fotos
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Modales
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingModalMode, setBookingModalMode] = useState<'booking' | 'visit'>('booking');
  const [bookingModalInitialStep, setBookingModalInitialStep] = useState<1 | 2>(1);
  const [createdContract, setCreatedContract] = useState<DigitalContract | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const isLiked = space ? isSpaceFavorite(space.id) : false;

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
          <ArrowLeft className="w-4 h-4" /> Volver al Catálogo
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
  const subRateLabel = activeModality === 'por_hora' ? 'mín. 2 hrs' : activeModality === 'mensual' ? 'fianza 1 mes' : 'mín. 1 día';

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
            {CATEGORY_NAMES[space.category] || space.category.toUpperCase()}
          </span>

          <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Espacio Verificado</span>
          </span>

          <span className="text-xs text-slate-500 hidden md:inline">
            • {space.address.split(',')[0]}, {space.commune}
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
              <span className="text-xs">{isLiked ? 'Guardado en Favoritos' : 'Guardar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. TÍTULO PRINCIPAL Y UBICACIÓN */}
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">
          {displayTitle}
        </h1>
        <p className="text-slate-600 text-xs sm:text-sm flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold text-slate-800">{space.address}</span>
          <span className="text-slate-500 hidden sm:inline">• {space.commune}, {space.region}</span>
        </p>
      </div>

      {/* 3. ESTRUCTURA PRINCIPAL EN DOS COLUMNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* =========================================================
            COLUMNA IZQUIERDA (62% ANCHO): GALERÍA, SPECS, DETALLES,
            AMENIDADES, REGLAS, ANFITRIÓN, CALENDARIO Y MAPA
            ========================================================= */}
        <div className="order-1 lg:order-none lg:col-start-1 lg:row-start-1 lg:col-span-8 space-y-7">
          {/* A. GALERÍA DE FOTOGRAFÍAS */}
          <div className="space-y-3">
            <div className="relative aspect-16/9 sm:aspect-21/10 rounded-3xl overflow-hidden bg-slate-950 border border-slate-200 shadow-md group">
              {imagesList.length > 0 ? <img src={imagesList[activeImageIndex]} alt={space.title} className="w-full h-full object-cover transition duration-300 group-hover:scale-101" /> : <div className="w-full h-full" aria-label="Este espacio no tiene fotografías" />}

              {/* Badges superiores flotantes */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md text-white text-xs font-bold shadow-md border border-white/10 flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Patio {space.surfaceM2} m²</span>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md text-white text-xs font-bold shadow-md border border-white/10 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Acceso 24/7 Smart Lock</span>
                </span>
              </div>

              {/* Badge inferior de contador */}
              {imagesList.length > 0 && <div className="absolute bottom-4 right-4 px-3 py-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md text-white text-xs font-bold shadow-md border border-white/10">
                Fotografía {activeImageIndex + 1} de {imagesList.length}
              </div>}
            </div>

            {/* Miniaturas de la galería */}
            {imagesList.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {imagesList.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-24 sm:w-28 h-16 sm:h-18 rounded-2xl overflow-hidden shrink-0 border-2 transition shadow-2xs cursor-pointer ${
                      activeImageIndex === idx
                        ? 'border-rose-600 ring-2 ring-rose-500/20 scale-102'
                        : 'border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" />
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
              <div className="text-lg sm:text-xl font-black text-rose-600 leading-tight">
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
                {activeModality === 'mensual' ? '35 puestos' : `${space.capacity} pers.`}
              </div>
              <span className="text-[10px] text-slate-400 block">
                {activeModality === 'mensual' ? 'Puestos / Equipos' : 'Formato Co-living / Eventos'}
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                SUPERFICIE TOTAL
              </span>
              <div className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-1.5 leading-tight">
                <Maximize2 className="w-4 h-4 text-slate-400" />
                {space.surfaceM2} m²
              </div>
              <span className="text-[10px] text-slate-400 block">Terraza + Salón techado</span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                {activeModality === 'mensual' ? 'ACCESO' : 'HORARIO'}
              </span>
              <div className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-1.5 leading-tight">
                <Clock className="w-4 h-4 text-slate-400" />
                {activeModality === 'mensual' ? '24/7 Smart' : '09 - 23h'}
              </div>
              <span className="text-[10px] text-slate-400 block">
                {activeModality === 'mensual' ? 'Cerradura Inteligente RFID' : 'Lunes a Sábado'}
              </span>
            </div>
          </div>

          {/* C. DESCRIPCIÓN DEL INMUEBLE */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-rose-600" />
              <span>
                {activeModality === 'mensual' ? 'Descripción de la Residencia Mensual' : 'Descripción del Inmueble'}
              </span>
            </h2>
            <div className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-2.5">
              <p>
                Exclusivo espacio patrimonial al aire libre con patio interior ajardinado y terraza panorámica en el corazón cultural de Bellas Artes. Cuenta con muros de ladrillo visto, toldos retráctiles incorporados y guirnaldas de iluminación cálida tenue. Configuración idónea para lanzamientos corporativos, talleres intensivos, rodajes comerciales y cócteles de networking de alto impacto.
              </p>
              {activeModality === 'mensual' && (
                <p className="text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  Cuenta con acceso autónomo 24/7 mediante cerraduras digitales Smart Lock, conexión de fibra óptica simétrica redundante de 1Gbps, servicio de limpieza integral, recepción de correspondencia, casilleros de seguridad y sala de conferencias privada equipada.
                </p>
              )}
            </div>
          </div>

          {/* D. AMENIDADES E INSTALACIONES CERTIFICADAS */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span>Lo que ofrece este espacio (Amenidades e Instalaciones)</span>
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                6 certificadas
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { name: 'Terraza Abierta con Toldos', icon: Sun },
                { name: 'Sistema de Audio Doble con 2 Zonas', icon: Volume2 },
                { name: 'Iluminación de Jardín Cálida', icon: Lightbulb },
                { name: 'Mobiliario Lounge para Reuniones', icon: Users },
                { name: 'Barra de Cóctel y Coffee Station', icon: Coffee },
                { name: 'Baños Equipados de Alto Tráfico', icon: Bath },
              ].map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/90 text-xs font-semibold text-slate-800"
                  >
                    <IconComponent className="w-4 h-4 text-slate-600 shrink-0" />
                    <span>{item.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* E. SERVICIOS FIJOS E INFRAESTRUCTURA (ESPECIALMENTE RESIDENCIA MENSUAL) */}
          {activeModality === 'mensual' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <span>Servicios Fijos e Infraestructura Incluida</span>
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  6 servicios fijos
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-indigo-50/30 border border-indigo-100 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Limpieza General Incluida
                  </div>
                  <p className="text-[11px] text-slate-500">Aseo profundo 2 veces por semana</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50/30 border border-indigo-100 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Fibra Óptica Dedicada Redundante
                  </div>
                  <p className="text-[11px] text-slate-500">1 Gbps simétrico con backup 5G</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50/30 border border-indigo-100 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Recepción y Casilleros de Seguridad
                  </div>
                  <p className="text-[11px] text-slate-500">Servicio de correspondencia en horario comercial</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50/30 border border-indigo-100 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Acceso 24/7 Smart Lock
                  </div>
                  <p className="text-[11px] text-slate-500">Cerradura inteligente con tarjeta y clave móvil</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50/30 border border-indigo-100 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Kitchenette & Coffee Station
                  </div>
                  <p className="text-[11px] text-slate-500">Espacio equipado para colación y café de grano</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-indigo-50/30 border border-indigo-100 space-y-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Gastos Comunes y Luz/Agua
                  </div>
                  <p className="text-[11px] text-slate-500">Tarifas estándar sin cobro mensual adicional</p>
                </div>
              </div>
            </div>
          )}

          {/* G. REGLAS Y CONDICIONES DEL RECINTO */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              <span>Reglas y Condiciones del Recinto (Ley 18.101 de Arrendamiento)</span>
            </h2>

            <div className="bg-rose-50/40 border border-rose-200/80 rounded-2xl p-4 text-xs text-slate-700 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Tolerancia de salida:</strong> Máximo hasta 30 minutos posteriores a la hora acordada de retiro.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Montaje y desmontaje:</strong> Deberán efectuarse estrictamente dentro del tiempo reservado contratado.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <span>
                  <strong>Aforo y ruidos:</strong> Estricto respeto al aforo y no emisión de ruidos molestos tras las 23:00 en áreas de jardín.
                </span>
              </div>
            </div>
          </div>

          {/* G. CONDICIONES DE CONTRATACIÓN MENSUAL (Si es mensual) */}
          {activeModality === 'mensual' && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <span>Condiciones de Contratación Mensual (Ley 18.101)</span>
              </h2>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Contrato de arriendo comercial regulado por Ley 18.101 con firma electrónica avanzada (FEA).</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>Plazo contractual mínimo renovable con 30 días de anticipación mínima.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>La garantía equivalente a 1 mes queda en custodia en cuenta escrow Spotly Finanzas y se restituye en un plazo no mayor a 30 días tras el acta de entrega.</span>
                </div>
              </div>
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
              <div className="w-14 h-14 rounded-2xl bg-[#1e293b] text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
                {space.ownerName.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900">{space.ownerName}</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Anfitrión Verificado</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  RUT: {formatRut(space.ownerRut)} • Responsable legal y acreditación en regla
                </p>
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
            landmark="Metro Bellas Artes a 150m"
          />
        </div>

      </div>

      {/* MODAL DE RESERVA FORMAL Y PAGO */}
      <BookingModal
        space={space}
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        initialMode={bookingModalMode}
        initialStep={bookingModalInitialStep}
        initialModality={activeModality}
        initialStartDate={startDate}
        initialEndDate={endDate}
        initialIntendedUse={intendedUse}
        hoursCount={hourEnd - hourStart}
        initialHourStart={hourStart}
        initialHourEnd={hourEnd}
        initialSelectedMonth={selectedMonth}
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
