import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Space, VisitRequest } from '../types.ts';
import { formatClp, getSpaceAvailableModalities, isHourSlotPast } from '../utils/formatters.ts';
import { useChileNow } from '../hooks/useChileNow.ts';
import { parseOpeningHours, isOpenOnDate, slotHours, closedDayName } from '../utils/schedule.ts';
import { calculateBookingAmounts, monthlyRange, upcomingMonths } from '../utils/pricing.ts';
import { getCategoryLabel } from '../utils/spaceCategories.ts';
import { useApp } from '../context/AppContext.tsx';
import { useSpaceReservations } from '../hooks/useSpaceReservations.ts';
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


const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const isOwnSpace = Boolean(currentUser && currentUser.id === space.ownerId);
  const [activeTab, setActiveTab] = useState<'booking' | 'visit'>('booking');
  const [monthCount, setMonthCount] = useState(1);

  // Reservas activas de este recinto (sincronizadas en tiempo real con el propietario)
  const activeReservationsForSpace = useSpaceReservations(space);

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
  const minHours = Math.max(1, space.minBookingHours || 1);

  // Horario de atención del espacio ("Lun-Vie 08:00-20:00"): define qué días se
  // puede reservar por hora, la primera franja y la hora máxima de término.
  const schedule = useMemo(() => parseOpeningHours(space.openingHours), [space.openingHours]);
  const SLOT_HOURS = useMemo(() => slotHours(schedule), [schedule]);
  const MAX_END_HOUR = schedule.close;
  const maxBlockHours = Math.max(minHours, Math.min(12, schedule.close - schedule.open));
  const openOnSelectedDate = isOpenOnDate(schedule, startDate);
  const pad2 = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const totalHours = Math.max(1, hourEnd - hourStart);
  const hourOptions = useMemo(() => {
    const opts: number[] = [];
    for (let h = minHours; h <= maxBlockHours; h++) opts.push(h);
    return opts;
  }, [minHours, maxBlockHours]);

  // Hora actual de Chile (se actualiza cada minuto): las franjas que ya pasaron
  // dejan de ofrecerse sin recargar la página.
  const chileNow = useChileNow();
  const todayIso = chileNow.iso;

  // Próximos 6 meses disponibles para arriendo mensual.
  const monthOptions = useMemo(() => upcomingMonths(todayIso, 6), [todayIso]);

  // El arriendo mensual se cobra en bloques de 30 días desde la fecha de inicio.
  useEffect(() => {
    if (activeModality !== 'mensual') return;
    const validMonth = monthOptions.some((m) => m.key === selectedMonth) ? selectedMonth : monthOptions[0].key;
    if (validMonth !== selectedMonth) {
      onMonthChange(validMonth);
      return;
    }
    const range = monthlyRange(validMonth, monthCount, todayIso);
    if (range.start !== startDate) onStartDateChange(range.start);
    if (range.end !== endDate) onEndDateChange(range.end);
  }, [activeModality, selectedMonth, monthCount]);

  // Al volver a arriendo por hora o por día se parte con un solo día seleccionado.
  const previousModality = useRef(activeModality);
  useEffect(() => {
    if (previousModality.current !== activeModality && activeModality !== 'mensual' && endDate !== startDate) {
      onEndDateChange(startDate);
    }
    previousModality.current = activeModality;
  }, [activeModality]);

  // Sugerencias automáticas e inteligentes según categoría del espacio, modalidad y título
  const automaticSuggestions = useMemo(() => {
    const cat = space.category;
    const isHourly = activeModality === 'por_hora';
    const isMonthly = activeModality === 'mensual';

    if (isMonthly) {
      return [
        {
          label: 'Sede de operaciones fija',
          fullText: `Establecimiento de sede fija y oficina operativa para equipo de trabajo en ${space.title}. Desarrollaremos labores profesionales de consultoría, gestión de proyectos y atención de clientes.`,
        },
        {
          label: 'Estudio creativo permanente',
          fullText: `Instalación de estudio creativo y taller permanente de diseño, post-producción y creación digital en ${space.title}.`,
        },
        {
          label: 'Oficina comercial y administrativa',
          fullText: `Oficina corporativa administrativa para gestión comercial, reuniones ejecutivas y trabajo continuo de colaboradores en ${space.title}.`,
        },
      ];
    }

    if (cat === 'estudio') {
      return [
        {
          label: 'Sesión de fotos y video comercial',
          fullText: isHourly
            ? `Producción audiovisual intensiva (${totalHours} horas) con cámaras de alta resolución, set de iluminación y grabación de material publicitario.`
            : `Jornada completa de producción audiovisual y sesión fotográfica editorial para campaña publicitaria en ${space.title}, con modelos y equipo técnico.`,
        },
        {
          label: 'Grabación de podcast / streaming',
          fullText: `Grabación de programa de podcast y entrevistas con set de micrófonos, cámaras estáticas y panel acústico en ${space.title}.`,
        },
        {
          label: 'Casting y pruebas de cámara',
          fullText: `Jornada de audición, casting de actores y pruebas de vestuario para producción comercial en ${space.title}.`,
        },
      ];
    }

    if (cat === 'salon_eventos') {
      return [
        {
          label: 'Workshop y capacitación práctica',
          fullText: `Taller presencial y capacitación profesional para asistentes en ${space.title}. Utilizaremos pantalla o proyector y dinámicas grupales prácticas.`,
        },
        {
          label: 'Lanzamiento de producto y networking',
          fullText: `Evento de presentación de producto, cóctel corporativo y bienvenida para clientes e invitados estratégicos en ${space.title}.`,
        },
        {
          label: 'Seminario técnico con expositores',
          fullText: `Seminario profesional con expositores invitados, dinámicas participativas y servicio de café en las instalaciones de ${space.title}.`,
        },
      ];
    }

    if (cat === 'oficina' || cat === 'cowork' || cat === 'sala_reuniones') {
      return [
        {
          label: 'Offsite y planeación estratégica',
          fullText: `Jornada de planificación estratégica trimestral, definición de metas y dinámicas colaborativas para equipo multidisciplinario en ${space.title}.`,
        },
        {
          label: 'Reunión de directorio e inversionistas',
          fullText: `Reunión formal de directorio corporativo y presentación de resultados financieros ante socios e inversionistas en la sala ejecutiva de ${space.title}.`,
        },
        {
          label: 'Sprints intensivos de desarrollo',
          fullText: `Jornada intensiva de trabajo de sprint técnico, diseño de producto y dinámicas de equipo ágil en ${space.title}.`,
        },
      ];
    }

    if (cat === 'quincho' || cat === 'terreno') {
      return [
        {
          label: 'Asado o celebración familiar',
          fullText: `Celebración familiar o asado con amigos en ${space.title}, respetando el aforo, los horarios y las normas del recinto.`,
        },
        {
          label: 'Cumpleaños',
          fullText: `Celebración de cumpleaños con invitados en ${space.title}, con entrega del espacio limpio al término.`,
        },
        {
          label: 'Encuentro de equipo',
          fullText: `Actividad de camaradería para el equipo de trabajo en ${space.title}.`,
        },
      ];
    }

    if (cat === 'departamento' || cat === 'casa' || cat === 'cabana') {
      return [
        {
          label: 'Estadía de descanso',
          fullText: `Estadía de descanso en ${space.title} para el número de personas indicado, respetando las normas de convivencia.`,
        },
        {
          label: 'Trabajo remoto',
          fullText: `Uso de ${space.title} como lugar tranquilo para trabajo remoto durante el período reservado.`,
        },
        {
          label: '‍‍Reunión familiar',
          fullText: `Reunión familiar en ${space.title}, dentro del aforo y del horario permitido.`,
        },
      ];
    }

    if (cat === 'consulta') {
      return [
        {
          label: 'Atención de pacientes',
          fullText: `Atención profesional de pacientes con agenda previa en ${space.title}.`,
        },
        {
          label: 'Sesiones de terapia',
          fullText: `Sesiones individuales de terapia o acompañamiento en ${space.title}, en un ambiente privado.`,
        },
      ];
    }

    if (cat === 'bodega' || cat === 'estacionamiento') {
      return [
        {
          label: 'Almacenaje temporal y logística',
          fullText: `Recepción, inventario y acopio temporal de mercadería para distribución y despacho comercial en ${space.title}.`,
        },
        {
          label: 'Montaje de escenografía y staging',
          fullText: `Armado, preparación y prueba técnica de elementos escenográficos y mobiliario para evento comercial.`,
        },
      ];
    }

    // Default / comercial / retail
    return [
      {
        label: 'Reunión de equipo y trabajo colaborativo',
        fullText: `Jornada de trabajo presencial y dinámicas colaborativas para equipo multidisciplinario en ${space.title}, respetando normas de convivencia y aforo.`,
      },
      {
        label: 'Pop-up y exhibición comercial',
        fullText: `Muestra temporal de productos, showroom exclusivo para clientes y activación comercial en ${space.title}.`,
      },
      {
        label: 'Sesión corporativa y presentaciones',
        fullText: `Presentación ejecutiva y sesión de trabajo con clientes y colaboradores en las instalaciones de ${space.title}.`,
      },
    ];
  }, [space.category, space.title, activeModality, totalHours]);

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

  // Franjas del día que ya comenzaron o pasaron (solo aplica a la fecha de hoy).
  const pastHoursOnSelectedDate = useMemo(() => {
    const past = new Set<number>();
    for (const h of SLOT_HOURS) {
      if (isHourSlotPast(startDate, h, chileNow)) past.add(h);
    }
    return past;
  }, [startDate, chileNow, SLOT_HOURS]);

  const isHourUnavailable = (h: number) => occupiedHoursOnSelectedDate.has(h) || pastHoursOnSelectedDate.has(h);

  // Horas seguidas libres desde `start` hasta la hora de cierre (o hasta la
  // primera hora ocupada). Es el máximo que se puede arrendar partiendo ahí.
  const freeRunFrom = (start: number) => {
    if (!openOnSelectedDate || start < schedule.open) return 0;
    let n = 0;
    for (let k = start; k < MAX_END_HOUR && !isHourUnavailable(k); k++) n++;
    return n;
  };

  // Horas de inicio posibles: libres y con al menos el mínimo de horas antes del cierre.
  const validStartHours = useMemo(() => {
    if (!openOnSelectedDate) return [];
    return SLOT_HOURS.filter((h) => freeRunFrom(h) >= minHours);
  }, [occupiedHoursOnSelectedDate, pastHoursOnSelectedDate, openOnSelectedDate, SLOT_HOURS, MAX_END_HOUR, minHours]);

  // Máximo de horas que se pueden elegir desde la hora de inicio actual: nunca se
  // pasa de la hora de cierre (si cierra a las 20:00, desde las 19:00 solo cabe 1).
  const maxFromStart = Math.min(maxBlockHours, freeRunFrom(hourStart));
  const fitsFromStart = (count: number) => count <= maxFromStart;

  // Cambia la cantidad de horas respetando la hora de inicio elegida.
  const setDuration = (count: number) => {
    if (!fitsFromStart(count)) return;
    onHourEndChange(hourStart + count);
  };

  const visibleSlotHours = useMemo(
    () => (openOnSelectedDate ? SLOT_HOURS.filter((h) => !pastHoursOnSelectedDate.has(h)) : []),
    [pastHoursOnSelectedDate, openOnSelectedDate, SLOT_HOURS]
  );
  const freeSlotCount = visibleSlotHours.filter((h) => !occupiedHoursOnSelectedDate.has(h)).length;

  // Mantiene una selección válida: si la hora elegida ya pasó o quedó ocupada, salta
  // a la primera disponible; si hoy ya no quedan horas, pasa al día siguiente.
  useEffect(() => {
    if (activeModality !== 'por_hora') return;
    if (startDate < todayIso) {
      onStartDateChange(todayIso);
      onEndDateChange(todayIso);
      return;
    }
    // Hoy ya cerró (o no abre hoy): se pasa al próximo día de atención.
    if (startDate === todayIso && (!openOnSelectedDate || SLOT_HOURS.every((h) => pastHoursOnSelectedDate.has(h)))) {
      let next = addDaysIso(todayIso, 1);
      for (let i = 0; i < 14 && !isOpenOnDate(schedule, next); i++) next = addDaysIso(next, 1);
      onStartDateChange(next);
      onEndDateChange(next);
      return;
    }
    // La hora de inicio ya pasó, quedó ocupada o no deja el mínimo antes del cierre:
    // se pasa a la primera hora válida.
    if (validStartHours.length > 0 && !validStartHours.includes(hourStart)) {
      const next = validStartHours.find((h) => h >= hourStart) ?? validStartHours[0];
      onHourStartChange(next);
      onHourEndChange(next + Math.max(minHours, Math.min(totalHours, freeRunFrom(next))));
      return;
    }
    // El bloque no puede pasar de la hora de cierre ni pisar horas ocupadas.
    if (validStartHours.includes(hourStart) && totalHours > maxFromStart) {
      onHourEndChange(hourStart + Math.max(minHours, maxFromStart));
    }
  }, [activeModality, startDate, todayIso, validStartHours, hourStart, totalHours, maxFromStart, pastHoursOnSelectedDate, openOnSelectedDate, schedule, minHours]);

  // Verificar si un mes está ocupado
  const isMonthOccupied = (monthKey: string) => {
    const range = monthlyRange(monthKey, monthCount, todayIso);
    return activeReservationsForSpace.some((r) => range.start <= r.endDate && range.end >= r.startDate);
  };

  // Detección estricta de colisión / doble reserva para la selección actual
  const hasCollision = useMemo(() => {
    if (activeModality === 'por_dia') {
      return activeReservationsForSpace.some(
        (r) => startDate <= r.endDate && endDate >= r.startDate
      );
    }
    if (activeModality === 'por_hora') {
      if (!validStartHours.includes(hourStart) || totalHours > maxFromStart) return true;
      for (let h = hourStart; h < hourEnd; h++) {
        if (occupiedHoursOnSelectedDate.has(h) || pastHoursOnSelectedDate.has(h)) return true;
      }
      return false;
    }
    if (activeModality === 'mensual') {
      return activeReservationsForSpace.some((r) => startDate <= r.endDate && endDate >= r.startDate);
    }
    return false;
  }, [activeModality, activeReservationsForSpace, startDate, endDate, hourStart, hourEnd, occupiedHoursOnSelectedDate, pastHoursOnSelectedDate, validStartHours, selectedMonth]);

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

  // Montos con la misma regla que valida la base de datos (src/utils/pricing.ts).
  const calculations = useMemo(() => {
    const amounts = calculateBookingAmounts({
      space,
      modality: activeModality,
      startDate,
      endDate: activeModality === 'por_hora' ? startDate : endDate,
      hourStart: activeModality === 'por_hora' ? hourStart : undefined,
      hourEnd: activeModality === 'por_hora' ? hourEnd : undefined,
    });
    return {
      ...amounts,
      unitLabel: `${amounts.units} ${amounts.label}`,
    };
  }, [space, activeModality, startDate, endDate, hourStart, hourEnd]);

  const categoryName = getCategoryLabel(space.category).toUpperCase();

  // ---- Selección de horas arrastrando sobre la grilla ----
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ anchor: number; moved: boolean } | null>(null);

  // Elige desde `a` hasta `b` (inclusive), recortando a las horas libres seguidas.
  const selectRange = (a: number, b: number) => {
    const start = Math.min(a, b);
    if (!validStartHours.includes(start)) return;
    const wanted = Math.abs(b - a) + 1;
    const len = Math.max(minHours, Math.min(wanted, freeRunFrom(start), maxBlockHours));
    onHourStartChange(start);
    onHourEndChange(start + len);
  };
  // Un toque: parte en esa hora conservando la duración elegida (si cabe).
  const pickHour = (h: number) => {
    if (!validStartHours.includes(h)) return;
    onHourStartChange(h);
    onHourEndChange(h + Math.max(minHours, Math.min(totalHours, freeRunFrom(h))));
  };
  const onSlotPointerDown = (e: React.PointerEvent, h: number) => {
    if (isHourUnavailable(h) || e.button !== 0) return;
    dragRef.current = { anchor: h, moved: false };
    const end = () => {
      const d = dragRef.current;
      dragRef.current = null;
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (d && !d.moved) pickHour(d.anchor);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const onTrackPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const hourAttr = el?.closest<HTMLElement>('[data-hour]')?.dataset.hour;
    if (hourAttr == null) return;
    const h = Number(hourAttr);
    if (h === d.anchor && !d.moved) return;
    d.moved = true;
    selectRange(d.anchor, h);
  };

  const currentPrice = activeModality === 'por_hora' ? priceHour : activeModality === 'mensual' ? priceMonth : priceDay;
  const currentUnit = activeModality === 'por_hora' ? 'por hora' : activeModality === 'mensual' ? 'al mes' : 'por día';
  const modalityTabs = (['por_hora', 'por_dia', 'mensual'] as const)
    .filter((m) => availableModalities.includes(m))
    .map((m) => ({
      id: m,
      label: m === 'por_hora' ? 'Por hora' : m === 'por_dia' ? 'Por día' : 'Por mes',
      hint: m === 'por_hora' ? formatClp(priceHour) : m === 'por_dia' ? formatClp(priceDay) : formatClp(priceMonth),
    }));

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-lg">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-slate-950 tabular">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={currentPrice}
                initial={{ y: 8, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -8, opacity: 0, filter: 'blur(4px)' }}
                transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
                className="inline-block text-[1.6rem] font-semibold tracking-[-0.02em]"
              >
                {formatClp(currentPrice)}
              </motion.span>
            </AnimatePresence>{' '}
            <span className="text-[15px] text-slate-600">{currentUnit}</span>
          </p>
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
            <span className="live-dot" aria-hidden="true" /> En vivo
          </span>
        </div>

        <div role="tablist" aria-label="Tipo de solicitud" className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          {([
            ['booking', 'Reservar', CalendarIcon],
            ['visit', 'Visita previa', Eye],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center justify-center gap-2 rounded-lg py-2 text-[13.5px] font-semibold transition-colors cursor-pointer ${
                activeTab === id ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {activeTab === id && (
                <motion.span layoutId="widget-tab" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }} />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'booking' ? (
        <div className="space-y-5 p-5 sm:p-6">
          {modalityTabs.length > 1 && (
            <div role="radiogroup" aria-label="Modalidad de arriendo" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${modalityTabs.length}, minmax(0, 1fr))` }}>
              {modalityTabs.map((m) => {
                const active = activeModality === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onModalityChange(m.id)}
                    className={`relative rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                      active ? 'border-slate-950' : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {active && (
                      <motion.span layoutId="widget-modality" className="absolute inset-0 rounded-xl ring-1 ring-slate-950" transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }} />
                    )}
                    <span className="block text-[13.5px] font-semibold text-slate-950">{m.label}</span>
                    <span className="block text-[12px] text-slate-500 tabular">{m.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Formulario adaptativo según la modalidad activa */}

          {/* CASO 1: POR DÍA */}
          {activeModality === 'por_dia' && (
            <div className="space-y-4">
              {/* DISPONIBILIDAD EN TIEMPO REAL INTEGRADA EN EL WIDGET */}
              <div className="bg-slate-50/90 rounded-2xl p-3 sm:p-3.5 border border-slate-200 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-brand-600" />
                    <span className="text-xs font-semibold text-slate-900">Disponibilidad en tiempo real</span>
                    <span className="text-[12.5px] font-semibold text-slate-500">• Septiembre de 2026</span>
                  </div>

                  {/* Leyenda */}
                  <div className="flex items-center gap-2.5 text-[11.5px]">
                    <span className="flex items-center gap-1 text-slate-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Disponible
                    </span>
                    <span className="flex items-center gap-1 text-slate-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-brand-500"></span> Ocupado
                    </span>
                    <span className="flex items-center gap-1 text-slate-900 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-slate-950"></span> Tu selección
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
                            ? 'bg-slate-950 border-slate-950 text-white shadow-sm ring-2 ring-slate-900/20 cursor-pointer'
                            : isSelected
                            ? 'bg-slate-800 border-slate-800 text-slate-100 cursor-pointer'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <span className={`text-[11.5px] uppercase font-semibold leading-none ${
                          isPast ? 'text-slate-400' : isCheckIn || isCheckOut || isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}>
                          {day.weekday}
                        </span>

                        <span className="text-sm sm:text-base font-semibold my-1 leading-none">
                          {day.dayNum}
                        </span>

                        <span className={`text-[9.5px] font-semibold px-1 py-0.5 rounded leading-none ${
                          isPast
                            ? 'bg-slate-200 text-slate-500'
                            : isOccupied
                            ? 'bg-brand-100 text-brand-700'
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
                  <label className="block text-[12.5px] font-semibold text-slate-700">Fecha de inicio</label>
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
                    className="w-full px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                  />
                  <span className="text-[11.5px] font-semibold text-slate-500 block">Check-in: 09:00 AM</span>
                </div>

                <div className="space-y-1 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 transition">
                  <label className="block text-[12.5px] font-semibold text-slate-700">Fecha de término</label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate >= todayIso ? startDate : todayIso}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val < todayIso || val < startDate) return;
                      onEndDateChange(val);
                    }}
                    className="w-full px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                  />
                  <span className="text-[11.5px] font-semibold text-slate-500 block">Check-out: 05:00 PM</span>
                </div>
              </div>

              {/* Mensaje de validación informativa */}
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-800 bg-emerald-50/80 border border-emerald-200 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Solo reservas válidas desde hoy ({formatIsoToDateDisplay(todayIso)}) en adelante.</span>
              </div>
            </div>
          )}

          {/* CASO 2: POR MES (RESIDENCIA) */}
          {activeModality === 'mensual' && (
            <div className="space-y-3">
              <div className="bg-brand-50 border border-brand-200 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11.5px] font-semibold uppercase tracking-wider text-brand-700">Modalidad exclusiva por mes</span>
                  <div className="text-xl font-semibold text-slate-900">
                    {formatClp(priceMonth)}
                    <span className="text-xs font-normal text-slate-500"> / mes</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-brand-600 text-white shadow-xs">
                  Contrato Ley 18.101
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[12.5px] font-semibold text-slate-700">Mes de inicio</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => onMonthChange(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                  >
                    {monthOptions.map((m) => (
                      <option key={m.key} value={m.key} disabled={isMonthOccupied(m.key)}>
                        {m.label} {isMonthOccupied(m.key) ? '(ocupado)' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11.5px] text-slate-500 block">
                    Desde el {formatIsoToDateDisplay(startDate)}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="block text-[12.5px] font-semibold text-slate-700">Duración</label>
                  <select
                    value={monthCount}
                    onChange={(e) => setMonthCount(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-hidden"
                  >
                    {[1, 2, 3, 6, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'mes' : 'meses'} • {formatClp(priceMonth * n)}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11.5px] text-slate-500 block">Hasta el {formatIsoToDateDisplay(endDate)}</span>
                </div>
              </div>

            </div>
          )}

          {/* CASO 3: POR HORA — fecha + horas que se eligen arrastrando */}
          {activeModality === 'por_hora' && (
            <div className="space-y-4">
              <label className="block rounded-xl border border-slate-300 px-4 py-2.5 focus-within:border-slate-950 focus-within:ring-1 focus-within:ring-slate-950">
                <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-slate-900">Fecha</span>
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
                  className="block w-full bg-transparent text-[15px] text-slate-950 outline-none cursor-pointer"
                />
              </label>

              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-semibold text-slate-950">Elige tus horas</span>
                  <span className={`text-[12.5px] tabular ${freeSlotCount === 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {freeSlotCount === 0 ? 'Sin horas libres' : `${freeSlotCount} ${freeSlotCount === 1 ? 'hora libre' : 'horas libres'}`}
                  </span>
                </div>

                {!openOnSelectedDate ? (
                  <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] text-slate-700">
                    No atiende los {closedDayName(startDate)}. Horario: {schedule.daysLabel.toLowerCase()}, de {schedule.hoursLabel}.
                  </p>
                ) : validStartHours.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] text-slate-700">No quedan horas libres este día. Prueba con otra fecha.</p>
                ) : (
                  <>
                    <div
                      ref={trackRef}
                      onPointerMove={onTrackPointerMove}
                      className="grid touch-pan-y select-none grid-cols-4 gap-1.5 sm:grid-cols-6"
                      role="group"
                      aria-label="Horas del día. Toca una hora libre o arrastra para elegir varias."
                    >
                      {visibleSlotHours.map((h) => {
                        const isOccupied = isHourUnavailable(h);
                        const isSelected = h >= hourStart && h < hourEnd;
                        const isEdgeStart = isSelected && h === hourStart;
                        const isEdgeEnd = isSelected && h === hourEnd - 1;
                        const startable = validStartHours.includes(h);
                        return (
                          <button
                            key={h}
                            type="button"
                            data-hour={h}
                            onPointerDown={(e) => onSlotPointerDown(e, h)}
                            onClick={(e) => {
                              if (e.detail === 0) pickHour(h); // teclado
                            }}
                            disabled={isOccupied}
                            aria-pressed={isSelected}
                            title={isOccupied ? `${pad2(h)} · reservada` : startable ? `${pad2(h)} · libre` : `${pad2(h)} · libre (no alcanza el mínimo de ${minHours} h)`}
                            className={`relative h-11 rounded-lg text-[13px] font-medium tabular transition-[background-color,color,border-color,transform] duration-150 ${
                              isOccupied
                                ? 'cursor-not-allowed border border-transparent bg-[repeating-linear-gradient(135deg,var(--color-slate-100)_0_4px,var(--color-slate-50)_4px_8px)] text-slate-400 line-through decoration-slate-300'
                                : isSelected
                                  ? 'z-10 border border-brand-600 bg-brand-600 text-white shadow-sm'
                                  : 'border border-slate-200 bg-white text-slate-800 hover:border-slate-900 cursor-pointer'
                            } ${isEdgeStart ? 'ring-2 ring-brand-600/25' : ''} ${isEdgeEnd ? 'ring-2 ring-brand-600/25' : ''}`}
                          >
                            {pad2(h)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[12px] text-slate-500">
                      Toca una hora libre o arrastra para elegir varias seguidas.
                      {startDate === todayIso && pastHoursOnSelectedDate.size > 0 ? ' Las horas que ya pasaron no aparecen.' : ''}
                    </p>
                  </>
                )}
              </div>

              {openOnSelectedDate && validStartHours.includes(hourStart) && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-slate-950 tabular">
                      {pad2(hourStart)} <span className="text-slate-400">→</span> {pad2(hourEnd)}
                    </p>
                    <p className="text-[12.5px] text-slate-500">
                      {totalHours} {totalHours === 1 ? 'hora' : 'horas'}
                      {maxFromStart < maxBlockHours && ` · máx. ${maxFromStart} desde las ${pad2(hourStart)}${hourStart + maxFromStart >= MAX_END_HOUR ? ' (cierre)' : ''}`}
                      {minHours > 1 && ` · mínimo ${minHours}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => totalHours > minHours && onHourEndChange(hourStart + (totalHours - 1))}
                      disabled={totalHours <= minHours}
                      aria-label="Restar una hora"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:border-slate-950 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDuration(totalHours + 1)}
                      disabled={!fitsFromStart(totalHours + 1)}
                      aria-label="Sumar una hora"
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:border-slate-950 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* ¿PARA QUÉ VA A UTILIZAR ESTE LUGAR? */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-900 block">
                  ¿Para qué va a utilizar este lugar?
                </label>
                <p className="text-[12.5px] text-slate-500 mt-0.5 leading-snug">
                  Comenta el uso que le darás al lugar durante tu reserva.
                </p>
              </div>
              <span className="text-[11.5px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md shrink-0 uppercase tracking-wider">
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
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-hidden bg-white shadow-2xs transition resize-y min-h-[80px] leading-relaxed"
              />
              <div className="flex items-center justify-between mt-1 text-[11.5px] text-slate-400 px-1">
                <span>
                  {intendedUse.trim().length === 0 ? (
                    <span className="text-amber-600 font-semibold">Requerido para realizar la reserva</span>
                  ) : (
                    <span className="text-emerald-700 font-semibold">Uso del lugar comentado ({intendedUse.length} caracteres)</span>
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
            <div className="flex items-center justify-between text-[12.5px] font-semibold text-slate-400 uppercase tracking-wider pb-1">
              <span>Concepto legal</span>
              <span>Importe en CLP</span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span>
                {formatClp(calculations.basePrice)} × {calculations.unitLabel}
                {activeModality === 'por_hora' && (
                  <> ({String(hourStart).padStart(2, '0')}:00 - {String(hourEnd).padStart(2, '0')}:00)</>
                )}
              </span>
              <span className="font-semibold">{formatClp(calculations.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span>Comisión de servicio Spotly (5 %)</span>
              <span className="font-semibold">{formatClp(calculations.platformFee)}</span>
            </div>
            {calculations.deposit > 0 && (
              <div className="flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-1">
                  Garantía mensual (reembolsable)
                  <Info className="w-3 h-3 text-slate-400" />
                </span>
                <span className="font-semibold">{formatClp(calculations.deposit)}</span>
              </div>
            )}
            {activeModality === 'mensual' && calculations.deposit === 0 && (
              <div className="text-[12.5px] text-emerald-700 font-semibold">Este propietario no exige garantía.</div>
            )}

            {/* TOTAL EN CLP A PAGAR */}
            <div className="border-t border-slate-200 pt-3 flex items-baseline justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-900 block">Total a pagar</span>
                <span className="text-[11.5px] text-slate-400">Valores exentos de IVA para personas naturales</span>
              </div>
              <div className="text-[1.35rem] font-semibold text-slate-950 tracking-tight tabular">
                {formatClp(calculations.total)}
              </div>
            </div>
          </div>

          {/* BOTÓN DE ACCIÓN PRINCIPAL / COMPROBACIÓN DE AUTENTICACIÓN */}
          {!currentUser ? (
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => onOpenAuth?.('login', 'Inicia sesión para reservar este espacio.')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-[15px] font-semibold text-white shadow-sm hover:bg-brand-700 cursor-pointer"
              >
                Inicia sesión para reservar
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth?.('register', 'Crea tu cuenta para reservar espacios en Spotly.')}
                className="w-full rounded-xl border border-slate-300 py-3 text-[14.5px] font-semibold text-slate-900 hover:border-slate-950 cursor-pointer"
              >
                Crear una cuenta
              </button>
              <p className="flex items-start gap-2 pt-1 text-[12.5px] leading-snug text-slate-500">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Para firmar el contrato con tu RUT y pagar necesitas una cuenta con identidad verificada. Aún no se te cobra nada.
              </p>
            </div>
          ) : currentUser.verificationStatus !== 'verified' ? (
            <div className="space-y-3 pt-1">
              <div className={`p-4 rounded-2xl space-y-2.5 shadow-xs border ${
                currentUser.verificationStatus === 'rejected'
                  ? 'bg-brand-50 border-brand-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    currentUser.verificationStatus === 'rejected'
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold ${
                      currentUser.verificationStatus === 'rejected' ? 'text-red-950' : 'text-amber-950'
                    }`}>
                      {currentUser.verificationStatus === 'rejected'
                        ? 'Solicitud de verificación rechazada'
                        : 'Se requiere verificación para reservar'}
                    </h4>
                    <p className={`text-[12.5px] mt-0.5 leading-relaxed ${
                      currentUser.verificationStatus === 'rejected' ? 'text-brand-800' : 'text-amber-800'
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
                          Por normativa de seguridad, solo usuarios con <strong>Perfil verificado</strong> pueden emitir contratos y realizar pagos en Spotly.
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
                  className={`w-full py-2.5 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                    currentUser.verificationStatus === 'rejected'
                      ? 'bg-brand-600 hover:bg-brand-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>
                    {currentUser.verificationStatus === 'rejected'
                      ? 'Ver motivo y corregir verificación'
                      : 'Verificar mi identidad ahora'}
                  </span>
                </button>
              </div>

              <button
                type="button"
                disabled
                className="w-full py-3.5 bg-slate-100 text-slate-400 rounded-2xl font-semibold text-xs flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200"
              >
                <Lock className="w-4 h-4 opacity-50" />
                <span>Bloqueado • falta verificación</span>
              </button>
            </div>
          ) : isOwnSpace || space.status !== 'active' ? (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-2.5 text-slate-700 text-xs">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">
                  {isOwnSpace ? 'Este espacio es tuyo' : 'Espacio aún no disponible para reservas'}
                </div>
                <div className="text-[12.5px] text-slate-600 mt-0.5 leading-snug">
                  {isOwnSpace
                    ? 'No puedes reservar tus propias publicaciones. Así es como lo verán los arrendatarios.'
                    : space.status === 'pending_approval'
                    ? 'La publicación está en revisión por administración. Se podrá reservar cuando sea aprobada.'
                    : 'El propietario pausó esta publicación temporalmente.'}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              {hasCollision && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-red-900 text-xs">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Horario o fecha bloqueada</div>
                    <div className="text-[12.5px] text-red-700 mt-0.5 leading-snug">
                      Este recinto ya cuenta con una reserva o solicitud activa para el {activeModality === 'por_hora' ? `horario ${hourStart}:00-${hourEnd}:00 hrs` : activeModality === 'mensual' ? 'período elegido' : 'día seleccionado'}. Selecciona otro rango para evitar doble reserva.
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onStartBooking}
                disabled={hasCollision}
                className={`w-full py-3.5 rounded-xl font-semibold text-[15px] transition flex items-center justify-center gap-2 ${
                  hasCollision
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
                    : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm cursor-pointer'
                }`}
              >
                {hasCollision ? (
                  <>
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>No disponible (Horario/Día ocupado)</span>
                  </>
                ) : (
                  <span>
                    {activeModality === 'por_dia'
                      ? 'Continuar al contrato digital'
                      : activeModality === 'mensual'
                      ? 'Continuar al contrato mensual'
                      : 'Continuar a reserva inmediata'}
                  </span>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-emerald-800 bg-emerald-50/80 py-1.5 px-3 rounded-xl border border-emerald-100">
                <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Perfil verificado • Pago protegido por Transbank</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* PESTAÑA VISITA PREVIA */
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-800 block">Agendar visita previa (100% gratuita)</span>
            <p className="text-[12.5px] text-slate-500">
              Conoce el espacio personalmente o mediante videollamada antes de formalizar el contrato de arriendo.
            </p>
          </div>

          {existingVisit ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs space-y-2">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Visita registrada
                </span>
                <span className="font-mono text-[11.5px] bg-emerald-100 px-2 py-0.5 rounded-full font-semibold">
                  {existingVisit.id}
                </span>
              </div>
              <p className="text-[12.5px] text-emerald-700">
                Fecha: <strong>{existingVisit.visitDate}</strong> ({existingVisit.visitTimeSlot}) • Modalidad:{' '}
                <strong>{existingVisit.modality === 'presencial' ? 'Presencial' : 'Virtual'}</strong>
              </p>
              <button
                type="button"
                onClick={onStartVisit}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs transition cursor-pointer"
              >
                Ver o reagendar visita
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">¿Cómo funciona?</div>
                <p className="text-[12.5px] text-slate-500">
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
                className="w-full py-3.5 bg-slate-950 hover:bg-slate-800 text-white rounded-xl font-semibold text-[15px] transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {!currentUser ? <Lock className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4" />}
                <span>{!currentUser ? 'Iniciar sesión para agendar visita' : 'Solicitar visita ahora'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
