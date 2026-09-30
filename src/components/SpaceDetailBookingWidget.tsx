import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Space, VisitRequest } from '../types.ts';
import { formatClp, getSpaceAvailableModalities, getTodayIso } from '../utils/formatters.ts';
import { useApp } from '../context/AppContext.tsx';
import {
  Calendar as CalendarIcon,
  Clock,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ChevronRight,
  Eye,
  FileCheck2,
  Info,
  Sparkles,
  Minus,
  Plus,
  AlertTriangle,
  Check,
} from 'lucide-react';

const formatIsoToDateDisplay = (isoStr: string) => {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
};

interface SpaceDetailBookingWidgetProps {
  space: Space;
  activeModality: 'por_hora' | 'por_dia' | 'mensual';
  onModalityChange: (modality: 'por_hora' | 'por_dia' | 'mensual') => void;
  startDate: string;
  onStartDateChange: (date: string) => void;
  endDate: string;
  onEndDateChange: (date: string) => void;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  hourStart: number;
  onHourStartChange: (h: number) => void;
  hourEnd: number;
  onHourEndChange: (h: number) => void;
  intendedUse: string;
  onIntendedUseChange: (use: string) => void;
  existingVisit?: VisitRequest;
  onStartBooking: () => void;
  onStartVisit: () => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}

export const SpaceDetailBookingWidget: React.FC<SpaceDetailBookingWidgetProps> = ({
  space,
  activeModality,
  onModalityChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  selectedMonth,
  onMonthChange,
  hourStart,
  onHourStartChange,
  hourEnd,
  onHourEndChange,
  intendedUse,
  onIntendedUseChange,
  existingVisit,
  onStartBooking,
  onStartVisit,
  onOpenAuth,
}) => {
  const { currentUser, reservations } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'booking' | 'visit'>('booking');
  const [monthDuration, setMonthDuration] = useState('6 meses renovables (Estándar)');

  // Reservas activas de este recinto (sincronizadas en tiempo real con el propietario)
  const activeReservationsForSpace = useMemo(() => {
    return reservations.filter(
      (r) => r.spaceId === space.id && r.status !== 'rejected' && r.status !== 'cancelled'
    );
  }, [reservations, space.id]);

  // Precios base por modalidad
  const priceDay = space.pricePerDay || 350000;
  const priceHour = space.pricePerHour || 45000;
  const priceMonth = space.pricePerMonth || 3800000;

  // Determinar modalidades disponibles según la publicación del espacio
  const availableModalities = useMemo<('por_hora' | 'por_dia' | 'mensual')[]>(() => {
    return getSpaceAvailableModalities(space);
  }, [space]);

  // Si la modalidad activa no está permitida en esta publicación, ajustarla automáticamente
  useEffect(() => {
    if (!availableModalities.includes(activeModality) && availableModalities.length > 0) {
      onModalityChange(availableModalities[0]);
    }
  }, [availableModalities, activeModality, onModalityChange]);

  // Días seleccionados para arriendo diario (cómputo inclusivo de fechas)
  const diffDays = useMemo(() => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff);
  }, [startDate, endDate]);

  // Horas seleccionadas
  const totalHours = Math.max(2, hourEnd - hourStart);

  // Sugerencias automáticas e inteligentes según categoría del espacio, modalidad y título
  const automaticSuggestions = useMemo(() => {
    const cat = space.category;
    const isHourly = activeModality === 'por_hora';
    const isMonthly = activeModality === 'mensual';

    if (isMonthly) {
      return [
        {
          label: '🏢 Sede de operaciones fija',
          fullText: `Establecimiento de sede fija y oficina operativa para equipo de trabajo en ${space.title}. Desarrollaremos labores profesionales de consultoría, gestión de proyectos y atención de clientes.`,
        },
        {
          label: '🎨 Estudio creativo permanente',
          fullText: `Instalación de estudio creativo y taller permanente de diseño, post-producción y creación digital en ${space.title}.`,
        },
        {
          label: '💼 Oficina comercial y administrativa',
          fullText: `Oficina corporativa administrativa para gestión comercial, reuniones ejecutivas y trabajo continuo de colaboradores en ${space.title}.`,
        },
      ];
    }

    if (cat === 'studio') {
      return [
        {
          label: '📸 Sesión de fotos y video comercial',
          fullText: isHourly
            ? `Producción audiovisual intensiva (${totalHours} horas) con cámaras de alta resolución, set de iluminación y grabación de material publicitario.`
            : `Jornada completa de producción audiovisual y sesión fotográfica editorial para campaña publicitaria en ${space.title}, con modelos y equipo técnico.`,
        },
        {
          label: '🎙️ Grabación de podcast / streaming',
          fullText: `Grabación de programa de podcast y entrevistas con set de micrófonos, cámaras estáticas y panel acústico en ${space.title}.`,
        },
        {
          label: '🎬 Casting y pruebas de cámara',
          fullText: `Jornada de audición, casting de actores y pruebas de vestuario para producción comercial en ${space.title}.`,
        },
      ];
    }

    if (cat === 'event') {
      return [
        {
          label: '🎤 Workshop y capacitación práctica',
          fullText: `Taller presencial y capacitación profesional para asistentes en ${space.title}. Utilizaremos pantalla o proyector y dinámicas grupales prácticas.`,
        },
        {
          label: '🥂 Lanzamiento de producto y networking',
          fullText: `Evento de presentación de producto, cóctel corporativo y bienvenida para clientes e invitados estratégicos en ${space.title}.`,
        },
        {
          label: '📊 Seminario técnico con expositores',
          fullText: `Seminario profesional con expositores invitados, dinámicas participativas y servicio de café en las instalaciones de ${space.title}.`,
        },
      ];
    }

    if (cat === 'office' || cat === 'cowork') {
      return [
        {
          label: '👥 Offsite y planeación estratégica',
          fullText: `Jornada de planificación estratégica trimestral, definición de metas y dinámicas colaborativas para equipo multidisciplinario en ${space.title}.`,
        },
        {
          label: '📈 Reunión de directorio e inversionistas',
          fullText: `Reunión formal de directorio corporativo y presentación de resultados financieros ante socios e inversionistas en la sala ejecutiva de ${space.title}.`,
        },
        {
          label: '🚀 Sprints intensivos de desarrollo',
          fullText: `Jornada intensiva de trabajo de sprint técnico, diseño de producto y dinámicas de equipo ágil en ${space.title}.`,
        },
      ];
    }

    if (cat === 'warehouse') {
      return [
        {
          label: '📦 Almacenaje temporal y logística',
          fullText: `Recepción, inventario y acopio temporal de mercadería para distribución y despacho comercial en ${space.title}.`,
        },
        {
          label: '🛠️ Montaje de escenografía y staging',
          fullText: `Armado, preparación y prueba técnica de elementos escenográficos y mobiliario para evento comercial.`,
        },
      ];
    }

    // Default / comercial / retail
    return [
      {
        label: '🤝 Reunión de equipo y trabajo colaborativo',
        fullText: `Jornada de trabajo presencial y dinámicas colaborativas para equipo multidisciplinario en ${space.title}, respetando normas de convivencia y aforo.`,
      },
      {
        label: '🛍️ Pop-up y exhibición comercial',
        fullText: `Muestra temporal de productos, showroom exclusivo para clientes y activación comercial en ${space.title}.`,
      },
      {
        label: '💡 Sesión corporativa y presentaciones',
        fullText: `Presentación ejecutiva y sesión de trabajo con clientes y colaboradores en las instalaciones de ${space.title}.`,
      },
    ];
  }, [space.category, space.title, activeModality, totalHours]);

  const todayIso = useMemo(() => getTodayIso(), []);

  // Franjas horarias ocupadas en la fecha seleccionada (sincronizado con reservas y solicitudes del anfitrión)
  const occupiedHoursOnSelectedDate = useMemo(() => {
    const occupied = new Set<number>();
    for (const r of activeReservationsForSpace) {
      if (startDate >= r.startDate && startDate <= r.endDate) {
        if (r.rentalModality === 'por_hora') {
          const startH = r.hourStart ?? 10;
          const endH = r.hourEnd ?? (startH + (r.durationUnits || r.totalDays || 4));
          for (let h = startH; h < endH; h++) {
            occupied.add(h);
          }
        } else {
          // Si está reservado por día o mensual, todo el horario de 9 a 21 está bloqueado
          for (let h = 9; h <= 21; h++) {
            occupied.add(h);
          }
        }
      }
    }
    return occupied;
  }, [activeReservationsForSpace, startDate]);

  // Verificar si un mes está ocupado
  const isMonthOccupied = (monthKey: string) => {
    return activeReservationsForSpace.some(
      (r) => r.rentalMonth === monthKey || (r.startDate.startsWith(monthKey) && r.status === 'confirmed')
    );
  };

  // Detección estricta de colisión / doble reserva para la selección actual
  const hasCollision = useMemo(() => {
    if (activeModality === 'por_dia') {
      return activeReservationsForSpace.some(
        (r) => startDate <= r.endDate && endDate >= r.startDate
      );
    }
    if (activeModality === 'por_hora') {
      for (let h = hourStart; h < hourEnd; h++) {
        if (occupiedHoursOnSelectedDate.has(h)) return true;
      }
      return false;
    }
    if (activeModality === 'mensual') {
      return isMonthOccupied(selectedMonth);
    }
    return false;
  }, [activeModality, activeReservationsForSpace, startDate, endDate, hourStart, hourEnd, occupiedHoursOnSelectedDate, selectedMonth]);

  // 14 días para disponibilidad diaria en tiempo real a partir del día de hoy
  const baseDate = useMemo(() => new Date(), []);
  const daysList = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + i);
      const dayNum = d.getDate();
      const monthNum = d.getMonth() + 1;
      const iso = `${d.getFullYear()}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      
      const weekdayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
      const weekday = weekdayNames[d.getDay()];
      
      // Sincronización con reservas reales del anfitrión para evitar doble reserva
      const hasReservation = activeReservationsForSpace.some((r) => {
        if (r.rentalModality === 'por_hora') {
          return iso === r.startDate;
        }
        return iso >= r.startDate && iso <= r.endDate;
      });

      const isOccupied = hasReservation;
      const isPast = iso < todayIso;
      const isCheckIn = iso === startDate;
      const isCheckOut = iso === endDate;
      const isSelected = iso >= startDate && iso <= endDate;

      return {
        iso,
        dayNum,
        monthNum,
        weekday,
        isOccupied,
        isPast,
        isCheckIn,
        isCheckOut,
        isSelected,
      };
    });
  }, [baseDate, startDate, endDate, todayIso, activeReservationsForSpace]);

  const handleSelectDay = (dayIso: string, isOccupied: boolean, isPast?: boolean) => {
    if (isOccupied || isPast || dayIso < todayIso) return;
    if (dayIso < startDate) {
      onStartDateChange(dayIso);
      if (dayIso > endDate) {
        onEndDateChange(dayIso);
      }
    } else if (dayIso === startDate) {
      onEndDateChange(dayIso);
    } else {
      onEndDateChange(dayIso);
    }
  };

  // Cálculos detallados
  const calculations = useMemo(() => {
    if (activeModality === 'por_dia') {
      const subtotal = priceDay * diffDays;
      const deposit = space.securityDeposit || 150000;
      const platformFee = Math.round(subtotal * 0.05);
      const total = subtotal + deposit + platformFee;
      return {
        unitLabel: `${diffDays} ${diffDays === 1 ? 'Día' : 'Días'} (Jornadas completas)`,
        subtotal,
        deposit,
        platformFee,
        total,
      };
    } else if (activeModality === 'mensual') {
      const subtotal = priceMonth;
      const deposit = space.securityDeposit || priceMonth; // 1 mes de garantía
      const commonExpenses = 0; // Incluidos
      const legalFee = Math.round(priceMonth * 0.0125); // 1.25% comisión de firma y verificación legal
      const total = subtotal + deposit + legalFee;
      return {
        unitLabel: 'Primer Mes de Arriendo',
        subtotal,
        deposit,
        commonExpenses,
        legalFee,
        total,
      };
    } else {
      // por_hora
      const subtotal = priceHour * totalHours;
      const deposit = 50000;
      const platformFee = Math.round(subtotal * 0.05);
      const total = subtotal + deposit + platformFee;
      return {
        unitLabel: `${totalHours} Horas x ${formatClp(priceHour)}/hr`,
        subtotal,
        deposit,
        platformFee,
        total,
      };
    }
  }, [activeModality, priceDay, priceHour, priceMonth, diffDays, totalHours, space.securityDeposit]);

  const categoryName = space.category === 'event'
    ? 'EVENTOS & WORKSHOPS'
    : space.category === 'office'
    ? 'OFICINA PRIVADA & RESIDENCIA'
    : 'ESPACIO CORPORATIVO';

  return (
    <div className="static lg:sticky lg:top-24 bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden">
      {/* 1. HEADER OSCURO SLATE (IDÉNTICO A LA REFERENCIA) */}
      <div className="bg-[#0f172a] text-white p-4 sm:p-5">
        <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-slate-300 uppercase mb-1">
          <span>{categoryName} • {space.commune.toUpperCase()}</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Activo
          </span>
        </div>

        <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
          {space.title}
        </h3>

        {/* Dos Pestañas en la cabecera: Reservar Espacio vs Visita Previa */}
        <div className="grid grid-cols-2 gap-2 mt-4 bg-slate-800/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('booking')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'booking'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Reservar Espacio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('visit')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'visit'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Visita Previa (Gratis)</span>
          </button>
        </div>
      </div>

      {/* 2. CONTENIDO DEL WIDGET */}
      {activeTab === 'booking' ? (
        <div className="p-5 sm:p-6 space-y-5">
          {/* Selector de Modalidad relacionado estrictamente con la publicación */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-wider">
              <span>{availableModalities.length === 1 ? 'Modalidad de esta Publicación' : 'Modalidad de Arriendo'}</span>
              <span className="text-emerald-700 font-semibold lowercase flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                {availableModalities.length === 1 ? 'Tarifa fijada' : 'Flexibilidad Spotly'}
              </span>
            </div>

            <div className={`grid gap-1.5 bg-slate-100/80 p-1 rounded-2xl border border-slate-200 ${
              availableModalities.length === 1
                ? 'grid-cols-1'
                : availableModalities.length === 2
                ? 'grid-cols-2'
                : 'grid-cols-3'
            }`}>
              {availableModalities.includes('por_hora') && (
                <button
                  type="button"
                  onClick={() => onModalityChange('por_hora')}
                  className={`py-2.5 px-2 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    activeModality === 'por_hora'
                      ? 'bg-white text-slate-900 shadow-md ring-2 ring-rose-500/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <span className="text-[11px] font-extrabold">Por Hora</span>
                  <span className={`text-[10px] font-bold ${activeModality === 'por_hora' ? 'text-rose-600' : 'text-slate-500'}`}>
                    {formatClp(priceHour)}
                  </span>
                  <span className="text-[9px] text-slate-400">Mínimo 2 hrs</span>
                </button>
              )}

              {availableModalities.includes('por_dia') && (
                <button
                  type="button"
                  onClick={() => onModalityChange('por_dia')}
                  className={`py-2.5 px-2 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    activeModality === 'por_dia'
                      ? 'bg-[#1e293b] text-white shadow-md ring-2 ring-slate-900/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <span className="text-[11px] font-extrabold">Por Día</span>
                  <span className={`text-[10px] font-bold ${activeModality === 'por_dia' ? 'text-amber-400' : 'text-slate-500'}`}>
                    {formatClp(priceDay)}
                  </span>
                  <span className={`text-[9px] ${activeModality === 'por_dia' ? 'text-slate-300' : 'text-slate-400'}`}>09:00 - 23:00</span>
                </button>
              )}

              {availableModalities.includes('mensual') && (
                <button
                  type="button"
                  onClick={() => onModalityChange('mensual')}
                  className={`py-2.5 px-2 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    activeModality === 'mensual'
                      ? 'bg-white text-slate-900 shadow-md ring-2 ring-indigo-500/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <span className="text-[11px] font-extrabold">Por Mes</span>
                  <span className={`text-[10px] font-bold ${activeModality === 'mensual' ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {priceMonth >= 1000000 ? `$${(priceMonth / 1000000).toFixed(1)}M` : formatClp(priceMonth)}
                  </span>
                  <span className="text-[9px] text-slate-400">Larga estancia</span>
                </button>
              )}
            </div>
          </div>

          {/* Formulario adaptativo según la modalidad activa */}

          {/* CASO 1: POR DÍA */}
          {activeModality === 'por_dia' && (
            <div className="space-y-4">
              {/* DISPONIBILIDAD EN TIEMPO REAL INTEGRADA EN EL WIDGET */}
              <div className="bg-slate-50/90 rounded-2xl p-3 sm:p-3.5 border border-slate-200 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-rose-600" />
                    <span className="text-xs font-bold text-slate-900">Disponibilidad en Tiempo Real</span>
                    <span className="text-[11px] font-semibold text-slate-500">• Septiembre de 2026</span>
                  </div>

                  {/* Leyenda */}
                  <div className="flex items-center gap-2.5 text-[10px]">
                    <span className="flex items-center gap-1 text-slate-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Disponible
                    </span>
                    <span className="flex items-center gap-1 text-slate-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span> Ocupado
                    </span>
                    <span className="flex items-center gap-1 text-slate-900 font-bold">
                      <span className="w-2 h-2 rounded-full bg-[#1e293b]"></span> Tu Selección
                    </span>
                  </div>
                </div>

                {/* Grilla interactiva de 14 días */}
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-0.5">
                  {daysList.map((day) => {
                    const isCheckIn = day.isCheckIn;
                    const isCheckOut = day.isCheckOut;
                    const isSelected = day.isSelected;
                    const isOccupied = day.isOccupied;
                    const isPast = day.isPast;

                    return (
                      <button
                        key={day.iso}
                        type="button"
                        onClick={() => handleSelectDay(day.iso, isOccupied, isPast)}
                        disabled={isOccupied || isPast}
                        title={isPast ? 'Fecha pasada no disponible' : isOccupied ? 'Fecha ocupada' : `Seleccionar ${day.dayNum}`}
                        className={`py-2 px-1 rounded-xl border text-center transition flex flex-col items-center justify-between select-none ${
                          isPast
                            ? 'bg-slate-100/60 border-slate-200 text-slate-400 opacity-40 cursor-not-allowed'
                            : isOccupied
                            ? 'bg-slate-100/70 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                            : isCheckIn || isCheckOut
                            ? 'bg-[#1e293b] border-[#1e293b] text-white shadow-sm ring-2 ring-slate-900/20 cursor-pointer'
                            : isSelected
                            ? 'bg-slate-800 border-slate-800 text-slate-100 cursor-pointer'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <span className={`text-[10px] uppercase font-bold leading-none ${
                          isPast ? 'text-slate-400' : isCheckIn || isCheckOut || isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}>
                          {day.weekday}
                        </span>

                        <span className="text-sm sm:text-base font-black my-1 leading-none">
                          {day.dayNum}
                        </span>

                        <span className={`text-[8px] sm:text-[8.5px] font-black px-1 py-0.5 rounded leading-none ${
                          isPast
                            ? 'bg-slate-200 text-slate-500'
                            : isOccupied
                            ? 'bg-rose-100 text-rose-700'
                            : isCheckIn
                            ? 'bg-emerald-400 text-slate-950'
                            : isCheckOut
                            ? 'bg-amber-400 text-slate-950'
                            : isSelected
                            ? 'bg-slate-700 text-white'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {isPast
                            ? 'Pasado'
                            : isOccupied
                            ? 'Ocupado'
                            : isCheckIn
                            ? 'Check-in'
                            : isCheckOut
                            ? 'Check-out'
                            : isSelected
                            ? 'En rango'
                            : 'Libre'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Casillas de selección Fecha de Inicio y Fecha de Término */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 transition">
                  <label className="block text-[11px] font-extrabold text-slate-700">Fecha de Inicio</label>
                  <input
                    type="date"
                    min={todayIso}
                    value={startDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val < todayIso) return;
                      onStartDateChange(val);
                      if (val > endDate) {
                        onEndDateChange(val);
                      }
                    }}
                    className="w-full px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] font-bold text-slate-500 block">Check-in: 09:00 AM</span>
                </div>

                <div className="space-y-1 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 transition">
                  <label className="block text-[11px] font-extrabold text-slate-700">Fecha de Término</label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate >= todayIso ? startDate : todayIso}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val < todayIso || val < startDate) return;
                      onEndDateChange(val);
                    }}
                    className="w-full px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] font-bold text-slate-500 block">Check-out: 05:00 PM</span>
                </div>
              </div>

              {/* Mensaje de validación informativa */}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50/80 border border-emerald-200 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Solo reservas válidas desde hoy ({formatIsoToDateDisplay(todayIso)}) en adelante.</span>
              </div>
            </div>
          )}

          {/* CASO 2: POR MES (RESIDENCIA) */}
          {activeModality === 'mensual' && (
            <div className="space-y-3">
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Modalidad Exclusiva por Mes</span>
                  <div className="text-xl font-black text-slate-900">
                    {formatClp(priceMonth)}
                    <span className="text-xs font-normal text-slate-500"> / mes</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-600 text-white shadow-xs">
                  Contrato Ley 18.101
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Mes de Inicio / Check-in</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => onMonthChange(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="2026-10" disabled={isMonthOccupied('2026-10')}>
                      01 de Octubre 2026 {isMonthOccupied('2026-10') ? '(Ocupado / Reservado)' : ''}
                    </option>
                    <option value="2026-11" disabled={isMonthOccupied('2026-11')}>
                      01 de Noviembre 2026 {isMonthOccupied('2026-11') ? '(Ocupado / Reservado)' : ''}
                    </option>
                    <option value="2026-12" disabled={isMonthOccupied('2026-12')}>
                      01 de Diciembre 2026 {isMonthOccupied('2026-12') ? '(Ocupado / Reservado)' : ''}
                    </option>
                    <option value="2027-01" disabled={isMonthOccupied('2027-01')}>
                      01 de Enero 2027 {isMonthOccupied('2027-01') ? '(Ocupado / Reservado)' : ''}
                    </option>
                  </select>
                  <span className="text-[10px] text-slate-500 block">Mín. 1 mes</span>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Duración Estimada</label>
                  <select
                    value={monthDuration}
                    onChange={(e) => setMonthDuration(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="3 meses">3 meses renovables</option>
                    <option value="6 meses renovables (Estándar)">6 meses renovables (Estándar)</option>
                    <option value="12 meses">12 meses (Largo plazo)</option>
                  </select>
                  <span className="text-[10px] text-slate-500 block">Término con 30 días de aviso</span>
                </div>
              </div>

              {/* Requisitos de Validación Ley 18.101 */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                  <span className="flex items-center gap-1">
                    <FileCheck2 className="w-3.5 h-3.5 text-indigo-600" />
                    Requisitos de Validación (Ley 18.101)
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold">100% digital</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-600 pt-1">
                  <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Informe Comercial / DICOM</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white p-2 rounded-xl border border-slate-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Acreditación de Renta / F1</span>
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 pt-0.5">
                  *Podrás subir tu documentación en el siguiente paso o solicitar verificación formal de Spotly.
                </p>
              </div>
            </div>
          )}

          {/* CASO 3: POR HORA */}
          {activeModality === 'por_hora' && (
            <div className="space-y-4">
              {/* CASILLA APARTE: SELECCIÓN DE CUÁNTAS HORAS QUIERO ARRENDAR */}
              <div className="bg-rose-50/60 border-2 border-rose-200/90 rounded-2xl p-3.5 sm:p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-rose-600" />
                    <label className="text-xs font-black text-slate-900 uppercase tracking-wide">
                      ¿Cuántas horas quieres arrendar?
                    </label>
                  </div>
                  <span className="text-[10px] font-extrabold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                    {totalHours} {totalHours === 1 ? 'hora' : 'horas'}
                  </span>
                </div>

                {/* Casilla interactiva con selector y controles +/- */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={totalHours}
                      onChange={(e) => {
                        const count = Number(e.target.value);
                        const newEnd = Math.min(22, hourStart + count);
                        onHourEndChange(newEnd);
                      }}
                      className="w-full px-3 py-2 text-xs font-black text-slate-900 bg-white border border-rose-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden shadow-xs cursor-pointer"
                    >
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                        <option key={h} value={h}>
                          {h} Horas de arriendo • {formatClp(priceHour * h)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Controles de suma y resta */}
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-rose-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (totalHours > 2) {
                          onHourEndChange(hourStart + (totalHours - 1));
                        }
                      }}
                      disabled={totalHours <= 2}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Restar 1 hora"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <span className="text-xs font-black w-8 text-center text-slate-900">
                      {totalHours}h
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (totalHours < 12 && hourStart + totalHours < 22) {
                          onHourEndChange(hourStart + (totalHours + 1));
                        }
                      }}
                      disabled={totalHours >= 12 || hourStart + totalHours >= 22}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Sumar 1 hora"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Atajos rápidos en píldoras */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] text-slate-500 font-bold mr-1">Opciones rápidas:</span>
                  {[2, 3, 4, 6, 8, 10].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        const newEnd = Math.min(22, hourStart + h);
                        onHourEndChange(newEnd);
                      }}
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                        totalHours === h
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-white text-slate-700 border-rose-200 hover:bg-rose-100/50'
                      }`}
                    >
                      {h} hrs
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de Fecha de Reserva */}
              <div className="space-y-1 bg-white p-3 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700">Fecha de Reserva</label>
                  <span className="text-[11px] font-black text-slate-900">{formatIsoToDateDisplay(startDate)}</span>
                </div>
                <input
                  type="date"
                  min={todayIso}
                  value={startDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val < todayIso) return;
                    onStartDateChange(val);
                    onEndDateChange(val);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              {/* Rango de Horarios (Hora Inicio y Hora Término calculada) */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1 bg-white p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-700">Hora Inicio</label>
                  <select
                    value={hourStart}
                    onChange={(e) => {
                      const newStart = Number(e.target.value);
                      onHourStartChange(newStart);
                      const newEnd = Math.min(22, newStart + totalHours);
                      onHourEndChange(newEnd);
                    }}
                    className="w-full px-2.5 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  >
                    {[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00 {h < 12 ? 'AM' : 'PM'}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-slate-500 block">Ingreso acordado</span>
                </div>

                <div className="space-y-1 bg-white p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-700">Hora Término (Calculada)</label>
                  <div className="px-2.5 py-2 bg-slate-50 text-slate-900 font-black text-xs rounded-xl border border-slate-200 flex items-center justify-between">
                    <span>{String(hourEnd).padStart(2, '0')}:00 {hourEnd < 12 ? 'AM' : 'PM'}</span>
                    <span className="text-[10px] font-extrabold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                      {totalHours} hrs
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">Salida del recinto</span>
                </div>
              </div>

              {/* Botones visuales de franjas horarias */}
              <div className="space-y-2 bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase">
                  <span>Franjas Horarias del Día (09:00 - 21:00)</span>
                  <span className={occupiedHoursOnSelectedDate.size > 0 ? "text-rose-700 font-bold lowercase" : "text-emerald-700 font-semibold lowercase"}>
                    {occupiedHoursOnSelectedDate.size > 0 ? `${occupiedHoursOnSelectedDate.size} hrs pedidas / ocupadas` : '100% disponible'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-slate-500 py-0.5">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    Disponible
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                    Pedida / Ocupada
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#1e293b] inline-block" />
                    Tu Selección
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((h) => {
                    const isOccupied = occupiedHoursOnSelectedDate.has(h);
                    const isSelected = h >= hourStart && h < hourEnd;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => {
                          if (isOccupied) return;
                          onHourStartChange(h);
                          onHourEndChange(Math.min(22, h + totalHours));
                        }}
                        disabled={isOccupied}
                        title={isOccupied ? `Franja ${h}:00 pedida u ocupada` : `Franja ${h}:00 disponible`}
                        className={`text-[10px] font-extrabold px-2 py-1 rounded-lg border transition cursor-pointer ${
                          isOccupied
                            ? 'bg-rose-100 text-rose-600 line-through cursor-not-allowed border-rose-300 font-medium'
                            : isSelected
                            ? 'bg-[#1e293b] text-white border-[#1e293b] shadow-xs ring-1 ring-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40'
                        }`}
                      >
                        {String(h).padStart(2, '0')}:00
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('calendario-disponibilidad');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="w-full text-center text-[10px] font-bold text-rose-600 hover:text-rose-700 pt-1 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <CalendarIcon className="w-3 h-3" />
                  <span>Ver calendario completo y detalle de horas pedidas</span>
                </button>
              </div>
            </div>
          )}

          {/* ¿PARA QUÉ VA A UTILIZAR ESTE LUGAR? */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <label className="text-xs font-extrabold text-slate-900 block">
                  ¿Para qué va a utilizar este lugar?
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Comenta el uso que le darás al lugar durante tu reserva.
                </p>
              </div>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md shrink-0 uppercase tracking-wider">
                Ley 18.101
              </span>
            </div>

            {/* Caja de texto para comentar para qué va a utilizar este lugar */}
            <div className="relative">
              <textarea
                rows={3}
                value={intendedUse}
                onChange={(e) => onIntendedUseChange(e.target.value)}
                placeholder="Comenta aquí para qué vas a utilizar este lugar..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 focus:outline-hidden bg-white shadow-2xs transition resize-y min-h-[80px] leading-relaxed"
              />
              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400 px-1">
                <span>
                  {intendedUse.trim().length === 0 ? (
                    <span className="text-amber-600 font-semibold">Requerido para realizar la reserva</span>
                  ) : (
                    <span className="text-emerald-700 font-semibold">✓ Uso del lugar comentado ({intendedUse.length} caracteres)</span>
                  )}
                </span>
                {intendedUse.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onIntendedUseChange('')}
                    className="text-slate-400 hover:text-slate-600 underline cursor-pointer"
                  >
                    Limpiar texto
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* DESGLOSE TRANSPARENTE DE COSTOS */}
          <div className="border-t border-slate-100 pt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-1">
              <span>Concepto Legal</span>
              <span>Importe en CLP</span>
            </div>

            {activeModality === 'por_dia' && (
              <>
                <div className="flex items-center justify-between text-slate-700">
                  <span>{formatClp(priceDay)} x {calculations.unitLabel}</span>
                  <span className="font-bold">{formatClp(calculations.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span className="flex items-center gap-1">
                    Garantía de arriendo (Reembolsable)
                    <Info className="w-3 h-3 text-slate-400" />
                  </span>
                  <span className="font-bold">{formatClp(calculations.deposit)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Servicio de Plataforma Spotly (5%)</span>
                  <span className="font-bold">{formatClp(calculations.platformFee)}</span>
                </div>
              </>
            )}

            {activeModality === 'mensual' && (
              <>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Primer Mes de Arriendo ({selectedMonth === '2026-10' ? 'Octubre 2026' : 'Próximo Mes'})</span>
                  <span className="font-bold">{formatClp(calculations.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span className="flex items-center gap-1">
                    Mes de Garantía (Custodia Spotly Escrow)
                    <Info className="w-3 h-3 text-slate-400" />
                  </span>
                  <span className="font-bold">{formatClp(calculations.deposit)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Gastos Comunes y Servicios (Agua, Luz e Internet)</span>
                  <span className="font-bold text-emerald-600">CLP 0 (Incluidos)</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Comisión de Firma y Verificación Legal (1.25%)</span>
                  <span className="font-bold">{formatClp(calculations.legalFee || 0)}</span>
                </div>
              </>
            )}

            {activeModality === 'por_hora' && (
              <>
                <div className="flex items-center justify-between text-slate-700">
                  <span>{totalHours} Horas x {formatClp(priceHour)}/hr ({String(hourStart).padStart(2, '0')}:00 - {String(hourEnd).padStart(2, '0')}:00)</span>
                  <span className="font-bold">{formatClp(calculations.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span className="flex items-center gap-1">
                    Garantía de uso por bloqueo (Reembolsable)
                    <Info className="w-3 h-3 text-slate-400" />
                  </span>
                  <span className="font-bold">{formatClp(calculations.deposit)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Tarifa por servicio Spotly (5%)</span>
                  <span className="font-bold">{formatClp(calculations.platformFee)}</span>
                </div>
              </>
            )}

            {/* TOTAL EN CLP A PAGAR */}
            <div className="border-t border-slate-200 pt-3 flex items-baseline justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">Total en CLP a Transferir/Pagar</span>
                <span className="text-[10px] text-slate-400">Valores exentos de IVA para personas naturales</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight">
                {formatClp(calculations.total)}
              </div>
            </div>
          </div>

          {/* BOTÓN DE ACCIÓN PRINCIPAL / COMPROBACIÓN DE AUTENTICACIÓN */}
          {!currentUser ? (
            <div className="space-y-2.5 pt-1">
              <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200/90 rounded-2xl space-y-2.5 shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-amber-950">Inicio de sesión o registro requerido</h4>
                    <p className="text-[11px] text-amber-800/90 leading-relaxed mt-0.5">
                      Para emitir el Contrato Digital (Ley 18.101) con tu RUT e individualización legal y resguardar tu fianza en cuenta de custodia (escrow), debes contar con una cuenta activa en Spotly.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenAuth?.('login', 'Inicia sesión para formalizar la reserva de este espacio.')}
                    className="py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition cursor-pointer text-center shadow-xs"
                  >
                    Iniciar Sesión
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth?.('register', 'Crea tu cuenta gratuita para formalizar arriendos en Spotly.')}
                    className="py-2.5 px-3 bg-white hover:bg-amber-100/50 border border-amber-300 text-amber-950 rounded-xl text-xs font-bold transition cursor-pointer text-center"
                  >
                    Crear Cuenta Gratis
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenAuth?.('login', 'Debes iniciar sesión o registrarte para realizar tu reserva en este espacio.')}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-xs shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Iniciar Sesión o Registrarse para Reservar</span>
              </button>

              <p className="text-[10px] text-center text-slate-400">
                Solo usuarios verificados pueden suscribir contratos de arriendo y procesar pagos.
              </p>
            </div>
          ) : currentUser.verificationStatus !== 'verified' ? (
            <div className="space-y-3 pt-1">
              <div className={`p-4 rounded-2xl space-y-2.5 shadow-xs border ${
                currentUser.verificationStatus === 'rejected'
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    currentUser.verificationStatus === 'rejected'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold ${
                      currentUser.verificationStatus === 'rejected' ? 'text-rose-950' : 'text-amber-950'
                    }`}>
                      {currentUser.verificationStatus === 'rejected'
                        ? 'Solicitud de verificación rechazada'
                        : 'Se requiere verificación para reservar'}
                    </h4>
                    <p className={`text-[11px] mt-0.5 leading-relaxed ${
                      currentUser.verificationStatus === 'rejected' ? 'text-rose-800' : 'text-amber-800'
                    }`}>
                      {currentUser.verificationStatus === 'rejected' ? (
                        <>
                          <strong>Motivo del rechazo:</strong> "
                          {currentUser.kycRejectionReason ||
                            currentUser.kycData?.rejectionReason ||
                            'La documentación enviada presenta observaciones o no es legible.'}
                          "
                        </>
                      ) : (
                        <>
                          Por normativa de seguridad, solo usuarios con <strong>Perfil Verificado</strong> pueden emitir contratos y realizar pagos en Spotly.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigate('/onboarding');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-full py-2.5 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                    currentUser.verificationStatus === 'rejected'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>
                    {currentUser.verificationStatus === 'rejected'
                      ? 'Ver Motivo y Corregir Verificación'
                      : 'Verificar mi Identidad Ahora'}
                  </span>
                </button>
              </div>

              <button
                type="button"
                disabled
                className="w-full py-3.5 bg-slate-100 text-slate-400 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200"
              >
                <Lock className="w-4 h-4 opacity-50" />
                <span>Bloqueado • Falta Verificación</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              {hasCollision && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-rose-900 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Horario o Fecha Bloqueada</div>
                    <div className="text-[11px] text-rose-700 mt-0.5 leading-snug">
                      Este recinto ya cuenta con una reserva o solicitud activa para el {activeModality === 'por_hora' ? `horario ${hourStart}:00-${hourEnd}:00 hrs` : activeModality === 'mensual' ? `mes de ${selectedMonth}` : 'día seleccionado'}. Selecciona otro rango para evitar doble reserva.
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onStartBooking}
                disabled={hasCollision}
                className={`w-full py-3.5 rounded-2xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 ${
                  hasCollision
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
                    : 'bg-rose-600 hover:bg-rose-700 text-white hover:shadow-lg cursor-pointer'
                }`}
              >
                {hasCollision ? (
                  <>
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>No Disponible (Horario/Día Ocupado)</span>
                  </>
                ) : (
                  <span>
                    {activeModality === 'por_dia'
                      ? 'Continuar al Contrato Digital →'
                      : activeModality === 'mensual'
                      ? 'Postular / Solicitar Arriendo Mensual →'
                      : 'Continuar a Reserva Inmediata →'}
                  </span>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-emerald-800 bg-emerald-50/80 py-1.5 px-3 rounded-xl border border-emerald-100">
                <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Perfil verificado • Garantía en custodia escrow (Ley 18.101)</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* PESTAÑA VISITA PREVIA */
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-800 block">Agendar Visita Previa (100% Gratuita)</span>
            <p className="text-[11px] text-slate-500">
              Conoce el espacio personalmente o mediante videollamada antes de formalizar el contrato de arriendo.
            </p>
          </div>

          {existingVisit ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs space-y-2">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Visita Registrada
                </span>
                <span className="font-mono text-[10px] bg-emerald-100 px-2 py-0.5 rounded-full font-bold">
                  {existingVisit.id}
                </span>
              </div>
              <p className="text-[11px] text-emerald-700">
                Fecha: <strong>{existingVisit.visitDate}</strong> ({existingVisit.visitTimeSlot}) • Modalidad:{' '}
                <strong>{existingVisit.modality === 'presencial' ? 'Presencial' : 'Virtual'}</strong>
              </p>
              <button
                type="button"
                onClick={onStartVisit}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition cursor-pointer"
              >
                Ver o Reagendar Visita
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="font-bold text-slate-800">¿Cómo funciona?</div>
                <p className="text-[11px] text-slate-500">
                  El anfitrión {space.ownerName} recibirá tu solicitud y confirmará la disponibilidad del horario en menos de 2 horas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    onOpenAuth?.('login', 'Inicia sesión o regístrate para solicitar una visita al espacio.');
                    return;
                  }
                  onStartVisit();
                }}
                className="w-full py-3 bg-[#1e293b] hover:bg-slate-900 text-white rounded-2xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {!currentUser ? <Lock className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4" />}
                <span>{!currentUser ? 'Iniciar Sesión para Agendar Visita' : 'Solicitar Visita Ahora'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
