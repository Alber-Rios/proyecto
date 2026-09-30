import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Check,
  Building2,
  Lock,
  ChevronLeft,
  ChevronRight,
  Info,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sun,
  Users,
  FileText,
  MessageSquare,
  Wrench,
  History,
  UserCheck,
  Layers,
  CalendarDays
} from 'lucide-react';
import { Space, Reservation } from '../types.ts';
import { formatClp, formatRut, getSpaceAvailableModalities, getTodayIso, formatDateCl } from '../utils/formatters.ts';
import { useApp } from '../context/AppContext.tsx';

interface SpaceAvailabilityViewerProps {
  space: Space;
  modality?: 'por_hora' | 'por_dia' | 'mensual';
  onModalityChange?: (mod: 'por_hora' | 'por_dia' | 'mensual') => void;
  startDate: string;
  endDate: string;
  onSelectDateRange: (start: string, end: string) => void;
  selectedMonth?: string; // e.g. '2026-10'
  onSelectMonth?: (month: string) => void;
  selectedHourStart?: number;
  selectedHourEnd?: number;
  onSelectHours?: (start: number, end: number) => void;
  onStartBooking?: () => void;
  isOwnerView?: boolean;
  onViewContract?: (res: Reservation) => void;
  onContactTenant?: (tenant: { name: string; email: string; phone: string; spaceTitle: string }) => void;
  onApproveReservation?: (resId: string) => void;
  onBlockMaintenance?: (date: string) => void;
  maintenanceBlocks?: { id: string; spaceId: string; date: string; reason: string }[];
  onRemoveMaintenance?: (id: string) => void;
}

export const SpaceAvailabilityViewer: React.FC<SpaceAvailabilityViewerProps> = ({
  space,
  modality: controlledModality,
  onModalityChange,
  startDate,
  endDate,
  onSelectDateRange,
  selectedMonth = '2026-10',
  onSelectMonth,
  selectedHourStart = 10,
  selectedHourEnd = 14,
  onSelectHours,
  onStartBooking,
  isOwnerView = false,
  onViewContract,
  onContactTenant,
  onApproveReservation,
  onBlockMaintenance,
  maintenanceBlocks = [],
  onRemoveMaintenance,
}) => {
  const { reservations, allUsers } = useApp();
  const todayIso = useMemo(() => getTodayIso(), []);
  const availableModalities = useMemo(() => getSpaceAvailableModalities(space), [space]);

  const getTenantPhone = (r: Reservation): string => {
    const matched = allUsers.find(
      (u) =>
        u.id === r.tenantId ||
        (u.rut && r.tenantRut && u.rut.replace(/\D/g, '') === r.tenantRut.replace(/\D/g, '')) ||
        (u.email && r.tenantEmail && u.email.toLowerCase() === r.tenantEmail.toLowerCase())
    );
    return matched?.phone || '+56 9 9123 4567';
  };

  // Modalidades soportadas por el espacio
  const supportsHourly = availableModalities.includes('por_hora');
  const supportsDaily = availableModalities.includes('por_dia');
  const supportsMonthly = availableModalities.includes('mensual');

  // Modalidad interna activa
  const [internalModality, setInternalModality] = useState<'por_hora' | 'por_dia' | 'mensual'>(() => {
    if (controlledModality) return controlledModality;
    return availableModalities[0] || 'por_dia';
  });

  const activeModality = controlledModality || internalModality;

  useEffect(() => {
    if (availableModalities.includes(activeModality)) return;
    const nextModality = availableModalities[0] || 'por_dia';
    setInternalModality(nextModality);
    onModalityChange?.(nextModality);
  }, [availableModalities, activeModality, onModalityChange]);

  const handleModalityToggle = (newMod: 'por_hora' | 'por_dia' | 'mensual') => {
    if (!availableModalities.includes(newMod)) return;
    setInternalModality(newMod);
    if (onModalityChange) {
      onModalityChange(newMod);
    }
  };

  // Estado para alternar entre vista cinta (días consecutivos) y calendario mensual completo (para por_hora y por_dia)
  const [viewMode, setViewMode] = useState<'strip' | 'month'>('strip');
  
  // Desplazamiento de días para la cinta (permite al propietario navegar al pasado)
  const [stripOffsetDays, setStripOffsetDays] = useState<number>(0);

  // Desplazamiento de meses para vista mensual en modo propietario
  const [monthOffset, setMonthOffset] = useState<number>(0);

  // Estado para el mes actualmente navegado en el calendario completo
  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
    if (startDate) {
      const parts = startDate.split('-');
      if (parts.length >= 2) return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) - 1 };
    }
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Reservas activas o históricas para este espacio específico
  const spaceReservations = useMemo(() => {
    return reservations.filter(
      (r) => r.spaceId === space.id && r.status !== 'rejected' && r.status !== 'cancelled'
    );
  }, [reservations, space.id]);

  // Lista de horas operativas (08:00 a 22:00)
  const OPERATING_HOURS = useMemo(() => {
    const list: number[] = [];
    for (let h = 8; h <= 21; h++) {
      list.push(h);
    }
    return list;
  }, []);

  // Verificar si la fecha seleccionada es pasada
  const isSelectedDatePast = useMemo(() => {
    const checkDate = startDate || todayIso;
    return checkDate < todayIso;
  }, [startDate, todayIso]);

  // Tarifas
  const priceHour = space.pricePerHour || Math.round(space.pricePerDay / 8) || 45000;
  const priceDay = space.pricePerDay || 280000;
  const priceMonth = space.pricePerMonth || 3800000;

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // -------------------------------------------------------------
  // CÁLCULOS PARA MODALIDAD 1: POR HORA
  // -------------------------------------------------------------
  const dayScheduleData = useMemo(() => {
    if (activeModality !== 'por_hora') return null;

    const dateToCheck = startDate || todayIso;
    const isPastDate = dateToCheck < todayIso;
    const occupiedMap = new Map<number, {
      title: string;
      use?: string;
      status: string;
      id: string;
      tenantName?: string;
      tenantEmail?: string;
      tenantPhone?: string;
      tenantRut?: string;
      subtotalClp?: number;
      reservation?: Reservation;
    }>();

    // Buscar reservas que cubran esta fecha
    for (const r of spaceReservations) {
      if (dateToCheck >= r.startDate && dateToCheck <= r.endDate) {
        const tenantPhone = getTenantPhone(r);
        if (r.rentalModality === 'por_hora') {
          const startH = r.hourStart ?? 9;
          const endH = r.hourEnd ?? (startH + (r.durationUnits || 4));
          for (let h = startH; h < endH; h++) {
            occupiedMap.set(h, {
              title: r.intendedUse || 'Arriendo por hora en curso',
              use: r.tenantName ? `Solicitud por ${r.tenantName.split(' ')[0]}` : 'Solicitud activa',
              status: r.status,
              id: r.id,
              tenantName: r.tenantName,
              tenantEmail: r.tenantEmail,
              tenantPhone,
              tenantRut: r.tenantRut,
              subtotalClp: r.subtotalClp,
              reservation: r,
            });
          }
        } else {
          // Bloqueado todo el día
          for (const h of OPERATING_HOURS) {
            occupiedMap.set(h, {
              title: r.rentalModality === 'mensual' ? 'Residencia mensual activa' : 'Jornada diaria completa reservada',
              use: r.intendedUse || 'Espacio reservado todo el día',
              status: r.status,
              id: r.id,
              tenantName: r.tenantName,
              tenantEmail: r.tenantEmail,
              tenantPhone,
              tenantRut: r.tenantRut,
              subtotalClp: r.subtotalClp,
              reservation: r,
            });
          }
        }
      }
    }

    const slots = OPERATING_HOURS.map((h) => {
      const nextH = h + 1;
      const isOccupied = occupiedMap.has(h);
      const occupiedInfo = occupiedMap.get(h);
      const isSelected = !isOwnerView && !isPastDate && !isOccupied && h >= selectedHourStart && h < selectedHourEnd;
      const isStart = !isOwnerView && !isPastDate && !isOccupied && h === selectedHourStart;
      const isEnd = !isOwnerView && !isPastDate && !isOccupied && h === selectedHourEnd - 1;

      return {
        hour: h,
        nextHour: nextH,
        label: `${String(h).padStart(2, '0')}:00 - ${String(nextH).padStart(2, '0')}:00`,
        shortLabel: `${String(h).padStart(2, '0')}:00`,
        isOccupied,
        occupiedInfo,
        isSelected,
        isStart,
        isEnd,
        isPastSlot: isPastDate,
      };
    });

    const occupiedCount = slots.filter((s) => s.isOccupied).length;
    const availableCount = slots.filter((s) => !s.isOccupied).length;
    const selectedCount = slots.filter((s) => s.isSelected).length;

    const uniqueBookings = Array.from(
      new Set(
        Array.from(occupiedMap.values())
          .filter((v) => v.reservation)
          .map((v) => v.reservation as Reservation)
      )
    );
    const dayEarningsClp = uniqueBookings.reduce((sum, b) => sum + (b.subtotalClp || 0), 0);

    return {
      date: dateToCheck,
      isPastDate,
      slots,
      occupiedCount,
      availableCount,
      selectedCount,
      uniqueBookings,
      dayEarningsClp,
    };
  }, [activeModality, startDate, todayIso, spaceReservations, OPERATING_HOURS, selectedHourStart, selectedHourEnd, isOwnerView, allUsers]);

  // Cinta de días para por_hora y por_dia
  const daysStrip = useMemo(() => {
    const baseDate = new Date();
    const startOffset = isOwnerView ? stripOffsetDays : 0;
    const totalDaysToShow = 14;

    return Array.from({ length: totalDaysToShow }, (_, i) => {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + startOffset + i);
      const dayNum = d.getDate();
      const monthNum = d.getMonth() + 1;
      const iso = `${d.getFullYear()}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      
      const weekdayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const weekday = weekdayNames[d.getDay()];

      const isPast = iso < todayIso;

      // Buscar reservas para este día
      const dayReservations = spaceReservations.filter((r) => iso >= r.startDate && iso <= r.endDate);
      const dayMaintenance = maintenanceBlocks.find((m) => m.spaceId === space.id && m.date === iso);
      const isDailyOrMonthlyOccupied =
        Boolean(dayMaintenance) ||
        dayReservations.some(
          (r) => r.rentalModality === 'por_dia' || r.rentalModality === 'mensual'
        );

      let occupiedHours = 0;
      for (const r of dayReservations) {
        if (r.rentalModality === 'por_hora') {
          const startH = r.hourStart ?? 9;
          const endH = r.hourEnd ?? (startH + (r.durationUnits || 4));
          occupiedHours += Math.max(0, endH - startH);
        } else {
          occupiedHours = OPERATING_HOURS.length;
        }
      }

      const isSelected = iso === (startDate || todayIso);
      const isAllOccupied = isDailyOrMonthlyOccupied || occupiedHours >= OPERATING_HOURS.length;
      const hasSomeOccupied = occupiedHours > 0 && !isAllOccupied;
      const freeHours = Math.max(0, OPERATING_HOURS.length - occupiedHours);

      return {
        iso,
        dayNum,
        monthNum,
        weekday,
        isPast,
        isSelected,
        occupiedHours,
        freeHours,
        isAllOccupied,
        hasSomeOccupied,
        dayReservations,
        dayMaintenance,
      };
    });
  }, [todayIso, startDate, spaceReservations, maintenanceBlocks, space.id, OPERATING_HOURS.length, isOwnerView, stripOffsetDays]);

  // Cuadrícula mensual para por_hora y por_dia
  const monthCalendarDays = useMemo(() => {
    const { year, month } = currentYearMonth;
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevMonthDaysCount = new Date(year, month, 0).getDate();
    const days = [];

    const paddingLeft = (firstDayIndex + 6) % 7;
    for (let i = paddingLeft - 1; i >= 0; i--) {
      days.push({
        dayNum: prevMonthDaysCount - i,
        isCurrentMonth: false,
        iso: '',
        isPast: true,
        isOccupied: false,
        hasSomeOccupied: false,
        isSelected: false,
        occupiedHours: 0,
        freeHours: 0,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isPast = iso < todayIso;
      const isSelected = iso === (startDate || todayIso);

      const dayReservations = spaceReservations.filter((r) => iso >= r.startDate && iso <= r.endDate);
      const dayMaintenance = maintenanceBlocks.find((m) => m.spaceId === space.id && m.date === iso);
      const isDailyOrMonthlyOccupied =
        Boolean(dayMaintenance) ||
        dayReservations.some(
          (r) => r.rentalModality === 'por_dia' || r.rentalModality === 'mensual'
        );

      let occupiedHours = 0;
      for (const r of dayReservations) {
        if (r.rentalModality === 'por_hora') {
          const startH = r.hourStart ?? 9;
          const endH = r.hourEnd ?? (startH + (r.durationUnits || 4));
          occupiedHours += Math.max(0, endH - startH);
        } else {
          occupiedHours = OPERATING_HOURS.length;
        }
      }

      const isAllOccupied = isDailyOrMonthlyOccupied || occupiedHours >= OPERATING_HOURS.length;
      const hasSomeOccupied = occupiedHours > 0 && !isAllOccupied;
      const freeHours = Math.max(0, OPERATING_HOURS.length - occupiedHours);

      days.push({
        dayNum: d,
        isCurrentMonth: true,
        iso,
        isPast,
        isSelected,
        isOccupied: isAllOccupied,
        hasSomeOccupied,
        occupiedHours,
        freeHours,
        dayReservations,
        dayMaintenance,
      });
    }

    return days;
  }, [currentYearMonth, todayIso, startDate, spaceReservations, maintenanceBlocks, space.id, OPERATING_HOURS.length]);

  // -------------------------------------------------------------
  // CÁLCULOS PARA MODALIDAD 2: POR DÍA
  // -------------------------------------------------------------
  const dayDetailsForSelectedDate = useMemo(() => {
    if (activeModality !== 'por_dia') return null;
    const dateToCheck = startDate || todayIso;
    const isPastDate = dateToCheck < todayIso;
    const dayReservations = spaceReservations.filter(
      (r) => dateToCheck >= r.startDate && dateToCheck <= r.endDate
    );
    const dayMaintenance = maintenanceBlocks.find(
      (m) => m.spaceId === space.id && m.date === dateToCheck
    ) || null;
    const isOccupied = dayReservations.length > 0 || Boolean(dayMaintenance);
    const primaryReservation = dayReservations[0] || null;

    return {
      date: dateToCheck,
      isPastDate,
      isOccupied,
      primaryReservation,
      dayReservations,
      dayMaintenance,
    };
  }, [activeModality, startDate, todayIso, spaceReservations, maintenanceBlocks, space.id]);

  // Duración en días calculada
  const calculatedDaysCount = useMemo(() => {
    if (!startDate) return 1;
    if (!endDate || endDate === startDate) return 1;
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diff);
  }, [startDate, endDate]);

  const estimatedDailyTotal = priceDay * calculatedDaysCount;

  // -------------------------------------------------------------
  // CÁLCULOS PARA MODALIDAD 3: MENSUAL
  // -------------------------------------------------------------
  const upcomingMonthsList = useMemo(() => {
    const list = [];
    const baseDate = new Date();
    // En vista propietario permitimos navegar libremente hacia atrás con monthOffset
    const startOffset = isOwnerView ? -3 + monthOffset : 0;
    const totalMonthsToShow = 12;

    for (let i = startOffset; i < startOffset + totalMonthsToShow; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const yearMonthIso = `${y}-${String(m + 1).padStart(2, '0')}`;
      const label = `${monthNames[m]} ${y}`;
      const isPast = yearMonthIso < todayIso.slice(0, 7);
      const isSelected = (selectedMonth || startDate.slice(0, 7) || todayIso.slice(0, 7)) === yearMonthIso;

      // Buscar si este mes está arrendado
      const monthReservation = spaceReservations.find(
        (r) =>
          r.rentalModality === 'mensual' &&
          (r.rentalMonth === yearMonthIso ||
            (yearMonthIso >= r.startDate.slice(0, 7) && yearMonthIso <= r.endDate.slice(0, 7)))
      );

      list.push({
        yearMonthIso,
        label,
        year: y,
        monthName: monthNames[m],
        isPast,
        isSelected,
        isOccupied: Boolean(monthReservation),
        reservation: monthReservation || null,
      });
    }

    return list;
  }, [todayIso, selectedMonth, startDate, spaceReservations, isOwnerView, monthOffset]);

  // Manejar clic en una hora para por_hora
  const handleHourClick = (hour: number, isOccupied: boolean) => {
    if (isOccupied || isSelectedDatePast) return;
    if (!onSelectHours) return;

    if (hour < selectedHourStart) {
      onSelectHours(hour, selectedHourEnd);
    } else if (hour >= selectedHourEnd) {
      onSelectHours(selectedHourStart, hour + 1);
    } else {
      const newEnd = Math.min(22, hour + 2);
      onSelectHours(hour, newEnd);
    }
  };

  const totalHours = Math.max(1, selectedHourEnd - selectedHourStart);
  const estimatedHourlySubtotal = priceHour * totalHours;

  return (
    <div id="calendario-disponibilidad" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-20">
      {/* 1. CABECERA PRINCIPAL CON SELECTOR DE MODALIDAD (SI EL ESPACIO LO PERMITE) */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 border-b border-slate-800">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-400 shrink-0 mt-0.5">
                <CalendarIcon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg lg:text-xl font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
                  {activeModality === 'por_hora' && (
                    <span>{isOwnerView ? 'Gestión y Bitácora de Horas' : 'Disponibilidad y Horas del Día'}</span>
                  )}
                  {activeModality === 'por_dia' && (
                    <span>{isOwnerView ? 'Gestión de Jornadas Diarias' : 'Disponibilidad por Día (Jornada Completa)'}</span>
                  )}
                  {activeModality === 'mensual' && (
                    <span>{isOwnerView ? 'Gestión de Residencia Mensual' : 'Disponibilidad y Selector Mensual'}</span>
                  )}

                  <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                    isOwnerView
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {isOwnerView ? 'Panel Propietario' : 'En Vivo'}
                  </span>
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  {activeModality === 'por_hora' && (
                    isOwnerView
                      ? 'Revisa el historial hacia atrás de horas ocupadas, solicitudes vigentes y gestiona el horario del recinto.'
                      : 'Revisa qué horas están pedidas y cuáles están libres para tu bloque de reserva.'
                  )}
                  {activeModality === 'por_dia' && (
                    isOwnerView
                      ? 'Revisa qué días están reservados a jornada completa y gestiona la disponibilidad diaria.'
                      : 'Selecciona las fechas de tu jornada completa. El recinto se arrienda por día cerrado.'
                  )}
                  {activeModality === 'mensual' && (
                    isOwnerView
                      ? 'Revisa los meses contratados con residencia mensual y consulta el historial de contratos.'
                      : 'Selecciona el mes para tu residencia comercial o contrato de arriendo continuo.'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* SELECTOR DE MODALIDAD TIPO SWITCHER (Visible cuando el espacio es flexible o multi-modalidad) */}
          {availableModalities.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-2xl border border-slate-700 self-start xl:self-center shrink-0">
              {supportsHourly && (
                <button
                  type="button"
                  onClick={() => handleModalityToggle('por_hora')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeModality === 'por_hora'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Por Hora</span>
                </button>
              )}
              {supportsDaily && (
                <button
                  type="button"
                  onClick={() => handleModalityToggle('por_dia')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeModality === 'por_dia'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  <span>Por Día</span>
                </button>
              )}
              {supportsMonthly && (
                <button
                  type="button"
                  onClick={() => handleModalityToggle('mensual')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activeModality === 'mensual'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Mensual</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* LEYENDA GLOBAL ADAPTADA */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <strong>Disponible / Libre</strong>
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <strong>{activeModality === 'por_hora' ? 'Hora Pedida / Ocupada' : activeModality === 'por_dia' ? 'Día Reservado' : 'Mes Contratado'}</strong>
          </span>
          {activeModality === 'por_hora' && !isOwnerView && (
            <span className="flex items-center gap-1.5 text-blue-300">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
              <strong>Tu Selección de Horas</strong> ({selectedHourStart}:00 a {selectedHourEnd}:00)
            </span>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* ========================================================================= */}
        {/* CASO 1: MODALIDAD POR HORA (Muestra selector de días + desglose 08:00 a 22:00) */}
        {/* ========================================================================= */}
        {activeModality === 'por_hora' && dayScheduleData && (
          <div className="space-y-6">
            {/* 1.1 SELECTOR DE FECHAS (CINTA O MES) */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>1. {isOwnerView ? 'Selecciona una fecha (Histórico o Futuro)' : 'Selecciona el Día a Consultar'}</span>
                </h3>

                <div className="flex items-center gap-2 flex-wrap">
                  {isOwnerView && viewMode === 'strip' && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setStripOffsetDays((prev) => prev - 7)}
                        className="px-2.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        title="Ver 7 días anteriores en el historial"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                        <span>Anterior</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStripOffsetDays(0)}
                        className={`px-2.5 py-1 rounded-xl border text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          stripOffsetDays === 0
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => setStripOffsetDays((prev) => prev + 7)}
                        className="px-2.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        title="Ver 7 días siguientes"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    </div>
                  )}

                  {/* Switcher Cinta vs Mes */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewMode('strip')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                        viewMode === 'strip' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Cinta
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('month')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                        viewMode === 'month' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Mes
                    </button>
                  </div>
                </div>
              </div>

              {/* VISTA 1: CINTA DE DÍAS */}
              {viewMode === 'strip' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {daysStrip.map((day) => {
                    const isSelected = day.isSelected;
                    const isPastForUser = !isOwnerView && day.isPast;

                    return (
                      <button
                        key={day.iso}
                        type="button"
                        onClick={() => {
                          if (isPastForUser) return;
                          onSelectDateRange(day.iso, day.iso);
                        }}
                        disabled={isPastForUser}
                        className={`p-2.5 sm:p-3 rounded-2xl border text-left transition flex flex-col justify-between select-none min-w-0 overflow-hidden ${
                          isPastForUser
                            ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'
                            : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-rose-500/40'
                            : day.isPast && isOwnerView
                            ? day.isAllOccupied
                              ? 'bg-rose-50 border-rose-300 text-rose-950 font-medium'
                              : day.hasSomeOccupied
                              ? 'bg-amber-50/80 border-amber-300 text-amber-950 font-medium'
                              : 'bg-slate-50 border-slate-300 text-slate-700'
                            : day.isAllOccupied
                            ? 'bg-rose-50/50 border-rose-200 text-slate-700 hover:bg-rose-50'
                            : day.hasSomeOccupied
                            ? 'bg-amber-50/40 border-amber-200 text-slate-800 hover:bg-amber-50'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className={`text-[10px] uppercase font-bold truncate ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                            {day.weekday}
                          </span>
                          {day.iso === todayIso && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${isSelected ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'}`}>
                              Hoy
                            </span>
                          )}
                          {day.isPast && isOwnerView && day.iso !== todayIso && (
                            <span className={`text-[8px] font-black px-1 py-0.5 rounded shrink-0 ${isSelected ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                              Hist.
                            </span>
                          )}
                        </div>

                        <div className="my-1">
                          <span className="text-xl font-black block">
                            {day.dayNum}
                          </span>
                        </div>

                        <div className="pt-1 border-t border-current/10 min-w-0">
                          {isPastForUser ? (
                            <span className="text-[9px] text-slate-400 font-medium block truncate">
                              Pasado
                            </span>
                          ) : day.isAllOccupied ? (
                            <span className={`text-[9px] font-bold block truncate ${isSelected ? 'text-rose-300' : 'text-rose-600'}`}>
                              🔴 Ocupado ({day.occupiedHours}h)
                            </span>
                          ) : day.hasSomeOccupied ? (
                            <span className={`text-[9px] font-bold block truncate ${isSelected ? 'text-amber-300' : 'text-amber-700'}`} title={`${day.occupiedHours}h pedidas • ${day.freeHours}h libres`}>
                              🟡 {day.occupiedHours}h ped. • {day.freeHours}h lib.
                            </span>
                          ) : (
                            <span className={`text-[9px] font-bold block truncate ${isSelected ? 'text-emerald-300' : 'text-emerald-700'}`}>
                              🟢 100% Libre
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* VISTA 2: MES COMPLETO */}
              {viewMode === 'month' && (
                <div className="bg-slate-50/80 p-3 sm:p-4 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentYearMonth((prev) => {
                          const newMonth = prev.month - 1;
                          if (newMonth < 0) return { year: prev.year - 1, month: 11 };
                          return { year: prev.year, month: newMonth };
                        });
                      }}
                      className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-slate-800">
                      {monthNames[currentYearMonth.month]} {currentYearMonth.year}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentYearMonth((prev) => {
                          const newMonth = prev.month + 1;
                          if (newMonth > 11) return { year: prev.year + 1, month: 0 };
                          return { year: prev.year, month: newMonth };
                        });
                      }}
                      className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((w) => (
                      <span key={w} className="text-[10px] font-black uppercase text-slate-400 py-1">
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthCalendarDays.map((d, idx) => {
                      if (!d.isCurrentMonth) {
                        return (
                          <div key={idx} className="p-2 text-center text-slate-300 text-xs font-semibold select-none">
                            {d.dayNum}
                          </div>
                        );
                      }

                      const isSelected = d.isSelected;
                      const isPastForUser = !isOwnerView && d.isPast;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (isPastForUser) return;
                            onSelectDateRange(d.iso, d.iso);
                          }}
                          disabled={isPastForUser}
                          className={`p-2 rounded-xl text-center transition flex flex-col items-center justify-between border min-h-[56px] ${
                            isPastForUser
                              ? 'bg-slate-100/50 border-transparent text-slate-300 cursor-not-allowed'
                              : 'cursor-pointer'
                          } ${
                            isSelected
                              ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                              : d.isPast && isOwnerView
                              ? d.isOccupied
                                ? 'bg-rose-100 border-rose-300 text-rose-950 font-bold'
                                : d.hasSomeOccupied
                                ? 'bg-amber-100 border-amber-300 text-amber-950 font-bold'
                                : 'bg-white border-slate-300 text-slate-700'
                              : d.isOccupied
                              ? 'bg-rose-50 border-rose-200 text-rose-800'
                              : d.hasSomeOccupied
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-xs font-black">{d.dayNum}</span>
                          <span className="text-[9px] font-bold">
                            {isPastForUser
                              ? '—'
                              : d.isOccupied
                              ? '🔴'
                              : d.hasSomeOccupied
                              ? `🟡 ${d.freeHours}h`
                              : '🟢'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 1.2 DESGLOSE HORA POR HORA (08:00 a 22:00) */}
            <div className="bg-slate-50/70 p-3.5 sm:p-5 rounded-3xl border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                      dayScheduleData.isPastDate
                        ? 'bg-slate-200 text-slate-800 border-slate-300'
                        : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}>
                      {dayScheduleData.isPastDate ? 'Fecha Histórica' : 'Día Seleccionado'}
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {formatDateCl(dayScheduleData.date)}
                    </span>
                    {dayScheduleData.isPastDate && isOwnerView && (
                      <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                        <History className="w-3 h-3" />
                        Bitácora Histórica
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {isOwnerView ? (
                      dayScheduleData.isPastDate
                        ? 'Modo Historial (Solo Lectura): Puedes revisar arriendos y contratos pasados, pero no bloquear ni modificar.'
                        : 'Estado en tiempo real de solicitudes, horas comprometidas y franjas libres (modificable de hoy en adelante).'
                    ) : (
                      'Haz clic en cualquier hora verde para seleccionar o ajustar tu bloque de arriendo.'
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>{dayScheduleData.availableCount} Horas Libres</span>
                  </span>

                  <span className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>{dayScheduleData.occupiedCount} Horas Ocupadas</span>
                  </span>

                  {!isOwnerView && !dayScheduleData.isPastDate && (
                    <span className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>{dayScheduleData.selectedCount} Horas Seleccionadas</span>
                    </span>
                  )}
                </div>
              </div>

              {isOwnerView && dayScheduleData.isPastDate && (
                <div className="p-3 rounded-2xl bg-indigo-50/90 border border-indigo-200 text-indigo-900 text-xs flex items-center gap-2.5">
                  <History className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    <strong>Consulta de Historial Pasado:</strong> Estás visualizando una fecha anterior a hoy ({todayIso}). Puedes revisar los contratos y arriendos realizados, pero no se permite bloquear ni realizar modificaciones en fechas pasadas.
                  </span>
                </div>
              )}

              {/* DETALLE DE SOLICITUDES Y ARRENDATARIOS DEL DÍA (MODO PROPIETARIO) */}
              {isOwnerView && dayScheduleData.uniqueBookings.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Solicitudes y Arrendatarios en esta Fecha ({dayScheduleData.uniqueBookings.length})</span>
                    </span>
                    <span className="text-xs font-extrabold text-emerald-700">
                      Subtotal del día: {formatClp(dayScheduleData.dayEarningsClp)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {dayScheduleData.uniqueBookings.map((booking) => {
                      const tPhone = getTenantPhone(booking);
                      const isPending = booking.status === 'pending';
                      return (
                        <div
                          key={booking.id}
                          className={`p-3.5 sm:p-4 rounded-2xl border shadow-2xs space-y-3 ${
                            isPending
                              ? 'bg-amber-50/90 border-amber-300'
                              : 'bg-white border-rose-200'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  isPending
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {isPending ? '⚡ Solicitud por Aprobar' : '✓ Reserva Confirmada'}
                              </span>
                              <span className="text-xs font-extrabold text-slate-900">
                                Horario: {String(booking.hourStart ?? 10).padStart(2, '0')}:00 a {String(booking.hourEnd ?? 16).padStart(2, '0')}:00 hrs ({booking.durationUnits || 6} hrs)
                              </span>
                            </div>
                            <span className="text-sm font-black text-emerald-700">
                              {formatClp(booking.subtotalClp)}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-white border border-slate-200 text-xs">
                            <div className="space-y-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                Datos del Arrendatario
                              </div>
                              <div className="font-bold text-slate-900 break-words">{booking.tenantName}</div>
                              <div className="text-slate-600">RUT: <strong>{formatRut(booking.tenantRut)}</strong></div>
                            </div>
                            <div className="space-y-1 min-w-0">
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                Contacto Directo
                              </div>
                              <div className="text-slate-700 font-medium break-all">
                                📧 {booking.tenantEmail || 'contacto@spotly.cl'}
                              </div>
                              <div className="text-slate-700 font-semibold">
                                📱 {tPhone}
                              </div>
                            </div>
                          </div>

                          {booking.intendedUse && (
                            <div className="text-xs text-slate-700 bg-white/80 px-3 py-2 rounded-xl border border-slate-200 break-words">
                              <strong className="text-slate-900">¿Para qué va a utilizar este lugar?:</strong> "{booking.intendedUse}"
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 pt-1">
                            {isPending && !dayScheduleData.isPastDate && onApproveReservation && (
                              <button
                                type="button"
                                onClick={() => onApproveReservation(booking.id)}
                                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Aprobar Solicitud</span>
                              </button>
                            )}
                            {onContactTenant && (
                              <button
                                type="button"
                                onClick={() =>
                                  onContactTenant({
                                    name: booking.tenantName,
                                    email: booking.tenantEmail || 'contacto@spotly.cl',
                                    phone: tPhone,
                                    spaceTitle: space.title,
                                  })
                                }
                                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                              >
                                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                                <span>Contactar ({tPhone})</span>
                              </button>
                            )}
                            {onViewContract && (
                              <button
                                type="button"
                                onClick={() => onViewContract(booking)}
                                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span>Ver Contrato Digital</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TIMELINE CONTINUA */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>08:00 hrs</span>
                  <span>Línea de Tiempo Continua (08:00 a 22:00)</span>
                  <span>22:00 hrs</span>
                </div>
                <div className="h-3.5 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                  {dayScheduleData.slots.map((slot) => (
                    <div
                      key={slot.hour}
                      className={`h-full flex-1 transition-all ${
                        slot.isOccupied
                          ? 'bg-rose-500'
                          : slot.isSelected
                          ? 'bg-slate-900'
                          : 'bg-emerald-400'
                      }`}
                      title={`${slot.label}: ${slot.isOccupied ? 'Ocupado' : slot.isSelected ? 'Tu Selección' : 'Disponible'}`}
                    />
                  ))}
                </div>
              </div>

              {/* CUADRÍCULA DE FRANJAS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {dayScheduleData.slots.map((slot) => {
                  const isOccupied = slot.isOccupied;
                  const isSelected = slot.isSelected;
                  const occInfo = slot.occupiedInfo;

                  return (
                    <div
                      key={slot.hour}
                      onClick={() => {
                        if (!isOwnerView) handleHourClick(slot.hour, isOccupied);
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between relative min-w-0 overflow-hidden ${
                        !isOwnerView && !isOccupied && !dayScheduleData.isPastDate
                          ? 'cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30'
                          : ''
                      } ${
                        isOccupied
                          ? isOwnerView && dayScheduleData.isPastDate
                            ? 'bg-rose-50/90 border-rose-300 text-slate-900 shadow-2xs'
                            : 'bg-rose-50/70 border-rose-200 text-slate-700 opacity-90'
                          : isSelected
                          ? 'bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-rose-500/40'
                          : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <span className="text-xs font-black flex items-center gap-1 whitespace-nowrap">
                          <Clock className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-rose-400' : isOccupied ? 'text-rose-500' : 'text-slate-400'}`} />
                          <span>{slot.label}</span>
                        </span>

                        {isOccupied ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 shrink-0 whitespace-nowrap ${
                            occInfo?.status === 'pending'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-rose-100 text-rose-700'
                          }`}>
                            <Lock className="w-2.5 h-2.5 shrink-0" />
                            <span>
                              {occInfo?.status === 'pending'
                                ? 'Solicitud'
                                : dayScheduleData.isPastDate
                                ? 'Ocupado'
                                : 'Reservada'}
                            </span>
                          </span>
                        ) : isSelected ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase flex items-center gap-1 shrink-0 whitespace-nowrap">
                            <Check className="w-2.5 h-2.5 shrink-0" />
                            <span>Elegida</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase shrink-0 whitespace-nowrap">
                            Libre
                          </span>
                        )}
                      </div>

                      <div className="mt-2 text-[11px] space-y-1">
                        {isOccupied ? (
                          <div className="space-y-1">
                            {isOwnerView && occInfo ? (
                              <div className="p-2.5 rounded-xl bg-white/95 border border-rose-200 space-y-1 text-slate-800 text-[10px]">
                                <div className="font-extrabold text-slate-900 flex items-center gap-1">
                                  <UserCheck className="w-3 h-3 text-rose-600 shrink-0" />
                                  <span className="truncate">{occInfo.tenantName || 'Arrendatario'}</span>
                                </div>
                                {occInfo.tenantRut && (
                                  <div className="text-slate-600 font-medium">RUT: {formatRut(occInfo.tenantRut)}</div>
                                )}
                                <div className="text-slate-600 truncate">
                                  📧 {occInfo.tenantEmail || 'contacto@spotly.cl'}
                                </div>
                                <div className="text-slate-700 font-semibold">
                                  📱 {occInfo.tenantPhone || '+56 9 9123 4567'}
                                </div>
                                {occInfo.title && (
                                  <div className="text-slate-600 line-clamp-1 italic">
                                    "{occInfo.title}"
                                  </div>
                                )}
                                {occInfo.subtotalClp && (
                                  <div className="font-bold text-emerald-700">
                                    {formatClp(occInfo.subtotalClp)}
                                  </div>
                                )}

                                <div className="pt-1 flex items-center gap-1 flex-wrap">
                                  {occInfo.status === 'pending' && !dayScheduleData.isPastDate && occInfo.reservation && onApproveReservation && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onApproveReservation(occInfo.reservation!.id);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] flex items-center gap-1 cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-2.5 h-2.5" />
                                      <span>Aprobar</span>
                                    </button>
                                  )}
                                  {occInfo.reservation && onViewContract && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onViewContract(occInfo.reservation!);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[9px] flex items-center gap-1 cursor-pointer"
                                    >
                                      <FileText className="w-2.5 h-2.5" />
                                      <span>Contrato</span>
                                    </button>
                                  )}
                                  {occInfo.reservation && onContactTenant && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onContactTenant({
                                          name: occInfo.tenantName || 'Arrendatario',
                                          email: occInfo.tenantEmail || 'contacto@spotly.cl',
                                          phone: occInfo.tenantPhone || '+56 9 9123 4567',
                                          spaceTitle: space.title,
                                        });
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[9px] flex items-center gap-1 cursor-pointer"
                                    >
                                      <MessageSquare className="w-2.5 h-2.5" />
                                      <span>Contactar</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-rose-700 space-y-0.5">
                                <span className="font-bold block">🔒 Horario no disponible</span>
                                <span className="text-[10px] text-slate-500 block">
                                  Franja horaria reservada previamente
                                </span>
                              </div>
                            )}
                          </div>
                        ) : isSelected ? (
                          <div className="text-slate-200">
                            <span className="font-bold block text-rose-300">
                              {slot.isStart ? '▶ Hora de Inicio' : slot.isEnd ? '⏹ Hora de Término' : '✔ Tramo incluido'}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              Tarifa: {formatClp(priceHour)}/hr
                            </span>
                          </div>
                        ) : (
                          <div className="text-slate-600">
                            <span className="font-bold text-emerald-700 block">
                              {dayScheduleData.isPastDate ? '🟢 Sin arriendo registrado' : '🟢 Disponible para reservar'}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              Tarifa: {formatClp(priceHour)}/hr
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 1.3 TARJETA RESUMEN POR HORA */}
            {!isOwnerView && !dayScheduleData.isPastDate && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded">
                      Horario Seleccionado
                    </span>
                    <span className="text-sm font-bold text-white">
                      {formatDateCl(dayScheduleData.date)}
                    </span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-white flex items-center gap-2 flex-wrap">
                    <span>{String(selectedHourStart).padStart(2, '0')}:00 a {String(selectedHourEnd).padStart(2, '0')}:00 hrs</span>
                    <span className="text-xs font-bold text-slate-300 bg-slate-700/60 px-2 py-0.5 rounded-lg border border-slate-600">
                      {totalHours} horas consecutivas
                    </span>
                    <span className="text-rose-400 text-base font-extrabold">
                      • {formatClp(estimatedHourlySubtotal)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Garantía legal custodiada y Contrato Digital regulado por Ley N° 18.101.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {onStartBooking && (
                    <button
                      type="button"
                      onClick={onStartBooking}
                      className="w-full md:w-auto px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Solicitar Reserva por Hora</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASO 2: MODALIDAD POR DÍA (Solo muestra días completos, SIN horas) */}
        {/* ========================================================================= */}
        {activeModality === 'por_dia' && dayDetailsForSelectedDate && (
          <div className="space-y-6">
            {/* 2.1 SELECTOR DE DÍAS (CINTA O MES) */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                  <span>1. Selecciona la Fecha o Período de Jornada Completa</span>
                </h3>

                <div className="flex items-center gap-2">
                  {isOwnerView && viewMode === 'strip' && (
                    <div className="flex items-center gap-1 mr-2">
                      <button
                        type="button"
                        onClick={() => setStripOffsetDays((prev) => prev - 7)}
                        className="px-2.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Anterior</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStripOffsetDays(0)}
                        className="px-2.5 py-1 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold"
                      >
                        Hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => setStripOffsetDays((prev) => prev + 7)}
                        className="px-2.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setViewMode('strip')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        viewMode === 'strip' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Cinta de Días
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('month')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        viewMode === 'month' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Mes Completo
                    </button>
                  </div>
                </div>
              </div>

              {/* VISTA 1: CINTA DE DÍAS (SOLO DÍAS COMPLETOS) */}
              {viewMode === 'strip' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {daysStrip.map((day) => {
                    const isSelected = day.isSelected;
                    const isPastForUser = !isOwnerView && day.isPast;
                    const isOccupiedDay = day.isAllOccupied || day.hasSomeOccupied;

                    return (
                      <button
                        key={day.iso}
                        type="button"
                        onClick={() => {
                          if (isPastForUser) return;
                          onSelectDateRange(day.iso, day.iso);
                        }}
                        disabled={isPastForUser}
                        className={`p-2.5 sm:p-3 rounded-2xl border text-left transition flex flex-col justify-between min-h-[90px] select-none min-w-0 overflow-hidden ${
                          isPastForUser
                            ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'
                            : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-rose-500/40'
                            : isOccupiedDay
                            ? 'bg-rose-50 border-rose-200 text-rose-950 font-bold'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className={`text-[10px] uppercase font-bold truncate ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                            {day.weekday}
                          </span>
                          {day.iso === todayIso && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${isSelected ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'}`}>
                              Hoy
                            </span>
                          )}
                          {day.isPast && isOwnerView && day.iso !== todayIso && (
                            <span className={`text-[8px] font-black px-1 py-0.5 rounded shrink-0 ${isSelected ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                              Hist.
                            </span>
                          )}
                        </div>

                        <div className="my-1">
                          <span className="text-2xl font-black block">
                            {day.dayNum}
                          </span>
                        </div>

                        <div className="pt-1.5 border-t border-current/10 min-w-0">
                          {isPastForUser ? (
                            <span className="text-[10px] text-slate-400 font-medium block truncate">
                              Pasado
                            </span>
                          ) : isOccupiedDay ? (
                            <span className={`text-[10px] font-bold block truncate ${isSelected ? 'text-rose-300' : 'text-rose-700'}`}>
                              🔴 Ocupado
                            </span>
                          ) : (
                            <span className={`text-[10px] font-bold block truncate ${isSelected ? 'text-emerald-300' : 'text-emerald-700'}`}>
                              🟢 Disponible
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* VISTA 2: MES COMPLETO (SOLO DÍAS) */}
              {viewMode === 'month' && (
                <div className="bg-slate-50/80 p-3 sm:p-4 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentYearMonth((prev) => {
                          const newMonth = prev.month - 1;
                          if (newMonth < 0) return { year: prev.year - 1, month: 11 };
                          return { year: prev.year, month: newMonth };
                        });
                      }}
                      className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-slate-800">
                      {monthNames[currentYearMonth.month]} {currentYearMonth.year}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentYearMonth((prev) => {
                          const newMonth = prev.month + 1;
                          if (newMonth > 11) return { year: prev.year + 1, month: 0 };
                          return { year: prev.year, month: newMonth };
                        });
                      }}
                      className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((w) => (
                      <span key={w} className="text-[10px] font-black uppercase text-slate-400 py-1">
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthCalendarDays.map((d, idx) => {
                      if (!d.isCurrentMonth) {
                        return (
                          <div key={idx} className="p-2 text-center text-slate-300 text-xs font-semibold select-none">
                            {d.dayNum}
                          </div>
                        );
                      }

                      const isSelected = d.isSelected;
                      const isPastForUser = !isOwnerView && d.isPast;
                      const isOccupiedDay = d.isOccupied || d.hasSomeOccupied;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (isPastForUser) return;
                            onSelectDateRange(d.iso, d.iso);
                          }}
                          disabled={isPastForUser}
                          className={`p-2 rounded-xl text-center transition flex flex-col items-center justify-between border min-h-[56px] ${
                            isPastForUser
                              ? 'bg-slate-100/50 border-transparent text-slate-300 cursor-not-allowed'
                              : 'cursor-pointer'
                          } ${
                            isSelected
                              ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                              : isOccupiedDay
                              ? 'bg-rose-50 border-rose-200 text-rose-900 font-bold'
                              : 'bg-white border-slate-200 text-slate-800 hover:bg-emerald-50/20'
                          }`}
                        >
                          <span className="text-xs font-black">{d.dayNum}</span>
                          <span className="text-[9px] font-bold">
                            {isPastForUser
                              ? '—'
                              : isOccupiedDay
                              ? '🔴 Ocupado'
                              : '🟢 Libre'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2.2 DETALLE DEL DÍA COMPLETO SELECCIONADO (SIN TABLA DE HORAS) */}
            <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                      dayDetailsForSelectedDate.isPastDate
                        ? 'bg-slate-200 text-slate-800 border-slate-300'
                        : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    }`}>
                      {dayDetailsForSelectedDate.isPastDate ? 'Fecha Histórica' : 'Modalidad Diaria'}
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {formatDateCl(dayDetailsForSelectedDate.date)}
                    </span>
                    {dayDetailsForSelectedDate.isPastDate && isOwnerView && (
                      <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200 flex items-center gap-1">
                        <History className="w-3 h-3" />
                        Solo Lectura (Historial)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {dayDetailsForSelectedDate.isPastDate && isOwnerView
                      ? 'Consulta histórica del día seleccionado. No se permiten bloqueos ni modificaciones en fechas pasadas.'
                      : `Acceso completo al recinto durante toda la jornada comercial (${space.openingHours || '09:00 - 19:00 hrs'}).`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                    dayDetailsForSelectedDate.isOccupied
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${dayDetailsForSelectedDate.isOccupied ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                    <span>
                      {dayDetailsForSelectedDate.dayMaintenance
                        ? 'Bloqueado por Mantención'
                        : dayDetailsForSelectedDate.isOccupied
                        ? 'Día Completo Ocupado'
                        : dayDetailsForSelectedDate.isPastDate
                        ? 'Sin Arriendo Registrado'
                        : 'Día Completo Disponible'}
                    </span>
                  </span>
                </div>
              </div>

              {isOwnerView && dayDetailsForSelectedDate.isPastDate && (
                <div className="p-3 rounded-2xl bg-indigo-50/90 border border-indigo-200 text-indigo-900 text-xs flex items-center gap-2.5">
                  <History className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    <strong>Bitácora Histórica:</strong> Esta fecha es anterior a hoy ({todayIso}). Solo está habilitada la visualización del historial; los bloqueos y modificaciones aplican de la fecha actual hacia adelante.
                  </span>
                </div>
              )}

              {/* Si hay bloqueo por mantención en esta fecha */}
              {isOwnerView && dayDetailsForSelectedDate.dayMaintenance && (
                <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 flex items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-amber-950 flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-amber-600" />
                      <span>Bloqueo por Mantención: {dayDetailsForSelectedDate.dayMaintenance.reason}</span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Fecha bloqueada: {dayDetailsForSelectedDate.dayMaintenance.date}
                    </p>
                  </div>
                  {!dayDetailsForSelectedDate.isPastDate && onRemoveMaintenance ? (
                    <button
                      type="button"
                      onClick={() => onRemoveMaintenance(dayDetailsForSelectedDate.dayMaintenance!.id)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      Desbloquear Fecha
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0">
                      🔒 Histórico (No modificable)
                    </span>
                  )}
                </div>
              )}

              {/* Si es propietario y está ocupado, muestra la ficha del cliente */}
              {isOwnerView && dayDetailsForSelectedDate.primaryReservation && (
                <div className="p-4 rounded-2xl bg-white border border-rose-200 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-rose-600" />
                        <span>Arrendatario: {dayDetailsForSelectedDate.primaryReservation.tenantName}</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          dayDetailsForSelectedDate.primaryReservation.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {dayDetailsForSelectedDate.primaryReservation.status === 'pending'
                          ? '⚡ Solicitud por Aprobar'
                          : '✓ Reserva Confirmada'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-emerald-700">
                      {formatClp(dayDetailsForSelectedDate.primaryReservation.subtotalClp)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div>RUT: <strong>{formatRut(dayDetailsForSelectedDate.primaryReservation.tenantRut)}</strong></div>
                    <div>Email: <strong>{dayDetailsForSelectedDate.primaryReservation.tenantEmail || 'contacto@spotly.cl'}</strong></div>
                    <div>Teléfono: <strong>{getTenantPhone(dayDetailsForSelectedDate.primaryReservation)}</strong></div>
                    <div>Uso: <em>"{dayDetailsForSelectedDate.primaryReservation.intendedUse || 'Arriendo diario'}"</em></div>
                  </div>
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    {dayDetailsForSelectedDate.primaryReservation.status === 'pending' &&
                      !dayDetailsForSelectedDate.isPastDate &&
                      onApproveReservation && (
                        <button
                          type="button"
                          onClick={() => onApproveReservation(dayDetailsForSelectedDate.primaryReservation!.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Aprobar Solicitud</span>
                        </button>
                      )}
                    {onViewContract && (
                      <button
                        type="button"
                        onClick={() => onViewContract(dayDetailsForSelectedDate.primaryReservation!)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold border border-rose-200 flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Ver Contrato Digital</span>
                      </button>
                    )}
                    {onContactTenant && (
                      <button
                        type="button"
                        onClick={() =>
                          onContactTenant({
                            name: dayDetailsForSelectedDate.primaryReservation!.tenantName,
                            email: dayDetailsForSelectedDate.primaryReservation!.tenantEmail || 'contacto@spotly.cl',
                            phone: getTenantPhone(dayDetailsForSelectedDate.primaryReservation!),
                            spaceTitle: space.title,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Contactar ({getTenantPhone(dayDetailsForSelectedDate.primaryReservation!)})</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2.3 TARJETA RESUMEN POR DÍA */}
            {!isOwnerView && !dayDetailsForSelectedDate.isPastDate && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                      Jornada Diaria Seleccionada
                    </span>
                    <span className="text-sm font-bold text-white">
                      {formatDateCl(dayDetailsForSelectedDate.date)}
                    </span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-white flex items-center gap-2 flex-wrap">
                    <span>{formatClp(priceDay)} / día completo</span>
                    <span className="text-xs font-bold text-slate-300 bg-slate-700/60 px-2 py-0.5 rounded-lg border border-slate-600">
                      {calculatedDaysCount} {calculatedDaysCount === 1 ? 'día' : 'días'}
                    </span>
                    <span className="text-emerald-400 text-base font-extrabold">
                      • Total: {formatClp(estimatedDailyTotal)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Garantía legal custodiada y Contrato Digital regulado por Ley N° 18.101.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {onStartBooking && (
                    <button
                      type="button"
                      onClick={onStartBooking}
                      className="w-full md:w-auto px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Solicitar Reserva por Día</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASO 3: MODALIDAD MENSUAL (Solo muestra selector de meses, SIN horas) */}
        {/* ========================================================================= */}
        {activeModality === 'mensual' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    1. {isOwnerView ? 'Selecciona el Mes (Historial o Futuro)' : 'Selecciona el Mes para tu Residencia Comercial'}
                  </span>
                </h3>

                {isOwnerView && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMonthOffset((prev) => prev - 6)}
                      className="px-2.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Meses Anteriores</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthOffset(0)}
                      className={`px-2.5 py-1 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        monthOffset === 0
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Actual
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthOffset((prev) => prev + 6)}
                      className="px-2.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <span>Meses Siguientes</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* CUADRÍCULA DE MESES */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {upcomingMonthsList.map((m) => {
                  const isPastForUser = !isOwnerView && m.isPast;

                  return (
                    <button
                      key={m.yearMonthIso}
                      type="button"
                      onClick={() => {
                        if (isPastForUser || (!isOwnerView && m.isOccupied)) return;
                        if (onSelectMonth) onSelectMonth(m.yearMonthIso);
                        // Fijar primer día del mes
                        onSelectDateRange(`${m.yearMonthIso}-01`, `${m.yearMonthIso}-28`);
                      }}
                      disabled={isPastForUser}
                      className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between select-none min-h-[110px] min-w-0 overflow-hidden ${
                        isPastForUser
                          ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'
                          : m.isSelected
                          ? 'bg-slate-900 border-slate-900 text-white shadow-md ring-2 ring-rose-500/40 cursor-pointer'
                          : m.isOccupied
                          ? 'bg-rose-50 border-rose-200 text-rose-950 font-bold cursor-pointer'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/20 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <span className={`text-sm font-black truncate ${m.isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {m.label}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {m.isPast && isOwnerView && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase whitespace-nowrap ${
                              m.isSelected ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-700'
                            }`}>
                              Hist.
                            </span>
                          )}
                          {m.isOccupied ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black uppercase whitespace-nowrap">
                              Arrendado
                            </span>
                          ) : m.isSelected ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase whitespace-nowrap">
                              Elegido
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase whitespace-nowrap">
                              Disponible
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="my-2 text-xs">
                        <span className="font-extrabold text-sm block">
                          {formatClp(priceMonth)} <span className="text-[11px] font-medium opacity-80">/ mes</span>
                        </span>
                      </div>

                      <div className="pt-2 border-t border-current/10 text-[10px]">
                        {m.isOccupied ? (
                          <span>🔒 Contrato Mensual {m.isPast ? '(Histórico)' : 'Vigente'}</span>
                        ) : m.isPast ? (
                          <span>📋 Sin arriendo mensual registrado</span>
                        ) : (
                          <span>✔ Contrato Digital Ley 18.101</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3.2 TARJETA RESUMEN MENSUAL */}
            {!isOwnerView && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded">
                      Residencia Mensual Continua
                    </span>
                    <span className="text-sm font-bold text-white">
                      Mes: {selectedMonth || '2026-10'}
                    </span>
                  </div>
                  <div className="text-lg sm:text-xl font-black text-white flex items-center gap-2 flex-wrap">
                    <span>{formatClp(priceMonth)} / mes fijo</span>
                    <span className="text-xs font-bold text-slate-300 bg-slate-700/60 px-2 py-0.5 rounded-lg border border-slate-600">
                      Garantía: {formatClp(space.securityDeposit || priceMonth)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Contrato Notarial / Digital con validez legal continua regulado por Ley N° 18.101.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {onStartBooking && (
                    <button
                      type="button"
                      onClick={onStartBooking}
                      className="w-full md:w-auto px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Solicitar Residencia Mensual</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACCIONES DEL PROPIETARIO */}
        {isOwnerView && (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 text-white flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-md overflow-hidden">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded whitespace-nowrap">
                  Operaciones del Recinto
                </span>
                <span className="text-sm font-bold text-white truncate">
                  {space.title} ({space.commune})
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {isSelectedDatePast
                  ? `Estás consultando el historial del ${startDate}. Los bloqueos y modificaciones solo están permitidos desde hoy (${todayIso}) en adelante.`
                  : 'Gestiona bloqueos por mantención o sanitización y revisa contratos digitales de hoy en adelante.'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {onBlockMaintenance && (
                isSelectedDatePast ? (
                  <span
                    className="px-3.5 py-2 rounded-xl bg-slate-800/60 text-slate-400 text-xs font-bold border border-slate-700/60 flex items-center gap-1.5 cursor-not-allowed select-none whitespace-nowrap"
                    title="No se pueden bloquear ni modificar fechas pasadas"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Fecha Pasada (Solo Historial)</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onBlockMaintenance(startDate || todayIso)}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Bloquear por Mantención ({startDate || todayIso})</span>
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
