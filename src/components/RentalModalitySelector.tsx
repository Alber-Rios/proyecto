import React from 'react';
import { Clock, Sun, Building2, Check, Sparkles } from 'lucide-react';
import { formatClp } from '../utils/formatters.ts';

const HOUR_OPTIONS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
  '22:00', '22:30', '23:00', '23:30', '24:00',
];

export interface RentalModalitySelectorProps {
  enableHourly: boolean;
  onEnableHourlyChange: (val: boolean) => void;
  hourlyPrice: number | '';
  onHourlyPriceChange: (val: number | '') => void;
  hourlyMinHours: number | '';
  onHourlyMinHoursChange: (val: number | '') => void;
  hourlyInstantBooking?: boolean;
  onHourlyInstantBookingChange?: (val: boolean) => void;

  enableDaily: boolean;
  onEnableDailyChange: (val: boolean) => void;
  dailyPrice: number | '';
  onDailyPriceChange: (val: number | '') => void;
  dailyOpeningHours: string;
  onDailyOpeningHoursChange: (val: string) => void;

  enableMonthly: boolean;
  onEnableMonthlyChange: (val: boolean) => void;
  monthlyPrice: number | '';
  onMonthlyPriceChange: (val: number | '') => void;
  securityDeposit: number | '';
  onSecurityDepositChange: (val: number | '') => void;

  // Callback when computed modality changes ('abierto' | 'por_hora' | 'por_dia' | 'mensual')
  computedModality: 'abierto' | 'por_hora' | 'por_dia' | 'mensual';
}

const sanitizePositiveInteger = (rawValue: string): number | '' => {
  const digitsOnly = rawValue.replace(/\D/g, '').replace(/^0+/, '');
  if (digitsOnly === '') return '';
  return parseInt(digitsOnly, 10);
};

export const RentalModalitySelector: React.FC<RentalModalitySelectorProps> = ({
  enableHourly,
  onEnableHourlyChange,
  hourlyPrice,
  onHourlyPriceChange,
  hourlyMinHours,
  onHourlyMinHoursChange,
  hourlyInstantBooking,
  onHourlyInstantBookingChange,

  enableDaily,
  onEnableDailyChange,
  dailyPrice,
  onDailyPriceChange,
  dailyOpeningHours,
  onDailyOpeningHoursChange,

  enableMonthly,
  onEnableMonthlyChange,
  monthlyPrice,
  onMonthlyPriceChange,
  securityDeposit,
  onSecurityDepositChange,

  computedModality,
}) => {
  // Parsear ventana horaria "09:00 - 19:00"
  const parsedWindow = React.useMemo(() => {
    const match = dailyOpeningHours.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    return {
      start: match ? match[1] : '09:00',
      end: match ? match[2] : '19:00',
    };
  }, [dailyOpeningHours]);

  const handleWindowStartChange = (newStart: string) => {
    onDailyOpeningHoursChange(`${newStart} - ${parsedWindow.end}`);
  };

  const handleWindowEndChange = (newEnd: string) => {
    onDailyOpeningHoursChange(`${parsedWindow.start} - ${newEnd}`);
  };

  // Asegurar que al menos una modalidad esté activa
  const handleToggleHourly = () => {
    if (enableHourly && !enableDaily && !enableMonthly) {
      // Es la única activa, no desactivar
      return;
    }
    onEnableHourlyChange(!enableHourly);
  };

  const handleToggleDaily = () => {
    if (enableDaily && !enableHourly && !enableMonthly) {
      return;
    }
    onEnableDailyChange(!enableDaily);
  };

  const handleToggleMonthly = () => {
    if (enableMonthly && !enableHourly && !enableDaily) {
      return;
    }
    onEnableMonthlyChange(!enableMonthly);
  };

  const handleSetAllOpen = () => {
    onEnableHourlyChange(true);
    onEnableDailyChange(true);
    onEnableMonthlyChange(true);
  };

  const isAllOpen = enableHourly && enableDaily && enableMonthly;

  return (
    <div className="space-y-4">
      {/* Barra de estado y selector rápido "Abierto a todo" */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">
              Modalidad de Disponibilidad:
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isAllOpen || computedModality === 'abierto'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : computedModality === 'por_hora'
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : computedModality === 'por_dia'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-purple-100 text-purple-800 border border-purple-200'
              }`}
            >
              {isAllOpen || computedModality === 'abierto'
                ? '✨ Abierto a Todo (Hora, Día y Mes)'
                : computedModality === 'por_hora'
                ? '⏱️ Solo Por Hora'
                : computedModality === 'por_dia'
                ? '📅 Solo Por Día'
                : '🏢 Solo Por Mes'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Activa o desactiva con los interruptores si arriendas por hora, día o mes. Puedes habilitar una, varias o todas simultáneamente.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSetAllOpen}
          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            isAllOpen
              ? 'bg-[#1e293b] text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 shadow-2xs'
          }`}
          title="Habilitar arriendo por hora, día y mes en simultáneo"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{isAllOpen ? '✓ Abierto a todo' : 'Habilitar todo'}</span>
        </button>
      </div>

      {/* TARJETA 1: POR HORA */}
      <div
        className={`bg-white rounded-2xl border transition-all duration-200 p-4 sm:p-5 shadow-xs space-y-3.5 ${
          enableHourly
            ? 'border-slate-300 ring-1 ring-slate-200/50'
            : 'border-slate-200 opacity-60 bg-slate-50/50'
        }`}
      >
        {/* Cabecera de la tarjeta */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 shrink-0">
              <Clock className="w-5 h-5 text-slate-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Por Hora</span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                  Flexible
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Reuniones, talleres, grabaciones ...
              </p>
            </div>
          </div>

          {/* Switch de activación */}
          <button
            type="button"
            role="switch"
            aria-checked={enableHourly}
            onClick={handleToggleHourly}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              enableHourly ? 'bg-[#1e293b]' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                enableHourly ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Inputs condicionales al estar activo */}
        {enableHourly ? (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Precio base */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Precio por hora (CLP)
                </label>
                <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 focus-within:ring-2 focus-within:ring-[#1e293b] focus-within:bg-white transition">
                  <span className="text-xs font-bold text-slate-900">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ej: 45000"
                    value={hourlyPrice === 0 ? '' : hourlyPrice}
                    onChange={(e) => {
                      onHourlyPriceChange(sanitizePositiveInteger(e.target.value));
                    }}
                    className="w-full bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden"
                    required
                  />
                  <span className="text-xs text-slate-400 font-medium shrink-0">/ hr</span>
                </div>
              </div>

              {/* Mínimo de reserva en horas (entero > 0) */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Mínimo de horas (entero &gt; 0)
                </label>
                <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 focus-within:ring-2 focus-within:ring-[#1e293b] focus-within:bg-white transition">
                  <button
                    type="button"
                    onClick={() => {
                      const current = Number(hourlyMinHours) || 1;
                      onHourlyMinHoursChange(Math.max(1, current - 1));
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition cursor-pointer shrink-0"
                  >
                    —
                  </button>
                  <div className="flex items-center justify-center gap-1 flex-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej: 2"
                      value={hourlyMinHours === 0 ? '' : hourlyMinHours}
                      onChange={(e) => {
                        const parsed = sanitizePositiveInteger(e.target.value);
                        if (parsed === '') {
                          onHourlyMinHoursChange('');
                        } else {
                          onHourlyMinHoursChange(Math.min(24, parsed));
                        }
                      }}
                      className="w-12 text-center bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden"
                      required
                    />
                    <span className="text-xs font-semibold text-slate-500">
                      {Number(hourlyMinHours) === 1 ? 'hr' : 'hrs'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = Number(hourlyMinHours) || 1;
                      onHourlyMinHoursChange(Math.min(24, current + 1));
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition cursor-pointer shrink-0"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic">
            Modalidad por hora desactivada para este espacio.
          </div>
        )}
      </div>

      {/* TARJETA 2: POR DÍA */}
      <div
        className={`bg-white rounded-2xl border transition-all duration-200 p-4 sm:p-5 shadow-xs space-y-3.5 ${
          enableDaily
            ? 'border-slate-300 ring-1 ring-slate-200/50'
            : 'border-slate-200 opacity-60 bg-slate-50/50'
        }`}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 shrink-0">
              <Sun className="w-5 h-5 text-slate-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Por Día</span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-50 text-orange-600 border border-orange-100">
                  Popular
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Jornada completa (8–10h) o evento del día
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enableDaily}
            onClick={handleToggleDaily}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              enableDaily ? 'bg-[#1e293b]' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                enableDaily ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Inputs */}
        {enableDaily ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Precio por día */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Precio por día (CLP)
              </label>
              <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 focus-within:ring-2 focus-within:ring-[#1e293b] focus-within:bg-white transition">
                <span className="text-xs font-bold text-slate-900">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej: 280000"
                  value={dailyPrice === 0 ? '' : dailyPrice}
                  onChange={(e) => {
                    onDailyPriceChange(sanitizePositiveInteger(e.target.value));
                  }}
                  className="w-full bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden"
                  required
                />
                <span className="text-xs text-slate-400 font-medium shrink-0">/ día</span>
              </div>
            </div>

            {/* Ventana horaria con menús desplegables */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Ventana horaria (Apertura - Cierre)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={parsedWindow.start}
                  onChange={(e) => handleWindowStartChange(e.target.value)}
                  className="bg-slate-100/80 border border-slate-200/80 rounded-xl px-2.5 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#1e293b] focus:bg-white focus:outline-hidden cursor-pointer"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={`start-${h}`} value={h}>
                      Desde {h}
                    </option>
                  ))}
                </select>
                <select
                  value={parsedWindow.end}
                  onChange={(e) => handleWindowEndChange(e.target.value)}
                  className="bg-slate-100/80 border border-slate-200/80 rounded-xl px-2.5 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#1e293b] focus:bg-white focus:outline-hidden cursor-pointer"
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={`end-${h}`} value={h}>
                      Hasta {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic">
            Modalidad por día desactivada para este espacio.
          </div>
        )}
      </div>

      {/* TARJETA 3: POR MES */}
      <div
        className={`bg-white rounded-2xl border transition-all duration-200 p-4 sm:p-5 shadow-xs space-y-3.5 ${
          enableMonthly
            ? 'border-slate-300 ring-1 ring-slate-200/50'
            : 'border-slate-200 opacity-60 bg-slate-50/50'
        }`}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-800 shrink-0">
              <Building2 className="w-5 h-5 text-slate-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Por Mes</span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  Larga estancia
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Puesto fijo, oficina privada o arriendo extendido
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enableMonthly}
            onClick={handleToggleMonthly}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              enableMonthly ? 'bg-[#1e293b]' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                enableMonthly ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Inputs */}
        {enableMonthly ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Tarifa mensual */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Tarifa mensual (CLP)
              </label>
              <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 focus-within:ring-2 focus-within:ring-[#1e293b] focus-within:bg-white transition">
                <span className="text-xs font-bold text-slate-900">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej: 3800000"
                  value={monthlyPrice === 0 ? '' : monthlyPrice}
                  onChange={(e) => {
                    onMonthlyPriceChange(sanitizePositiveInteger(e.target.value));
                  }}
                  className="w-full bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden"
                  required
                />
                <span className="text-xs text-slate-400 font-medium shrink-0">/ m</span>
              </div>
            </div>

            {/* Garantía / Depósito */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-600">
                  Garantía / Depósito (CLP)
                </label>
                {monthlyPrice && Number(monthlyPrice) > 0 && (
                  <button
                    type="button"
                    onClick={() => onSecurityDepositChange(Number(monthlyPrice))}
                    className="text-[10px] text-slate-500 hover:text-slate-900 underline cursor-pointer"
                  >
                    Fijar 1 Mes
                  </button>
                )}
              </div>
              <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 focus-within:ring-2 focus-within:ring-[#1e293b] focus-within:bg-white transition">
                <span className="text-xs font-bold text-slate-900">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej: 500000"
                  value={securityDeposit === 0 ? '' : securityDeposit}
                  onChange={(e) => {
                    onSecurityDepositChange(sanitizePositiveInteger(e.target.value));
                  }}
                  className="w-full bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden"
                />
                <span className="text-[11px] text-slate-400 font-medium shrink-0">
                  {monthlyPrice && Number(securityDeposit) === Number(monthlyPrice)
                    ? '(1 Mes)'
                    : '/ garantía'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic">
            Modalidad mensual desactivada para este espacio.
          </div>
        )}
      </div>
    </div>
  );
};
