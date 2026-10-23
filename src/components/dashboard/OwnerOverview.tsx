import React, { useMemo } from 'react';
import { Building, CalendarCheck, Clock, Eye, MapPin, PauseCircle, TrendingUp, Wallet } from 'lucide-react';
import type { Reservation, Space, SpaceBlock, VisitRequest } from '../../types.ts';
import { formatClp } from '../../utils/formatters.ts';
import {
  ActionQueue,
  HeatDay,
  HorizontalBarList,
  OccupancyHeatStrip,
  StatTile,
  VerticalBarChart,
  lastMonths,
  pctChange,
} from './DashboardCharts.tsx';

type OwnerTab = 'spaces' | 'bookings' | 'finances' | 'calendar' | 'visits';

interface OwnerOverviewProps {
  todayIso: string;
  spaces: Space[];
  bookings: Reservation[];
  pendingBookings: Reservation[];
  upcomingVisits: VisitRequest[];
  blocks: SpaceBlock[];
  onGoTab: (tab: OwnerTab) => void;
  onOpenCalendar: (spaceId: string, dateIso: string) => void;
}

const OPERATING_HOURS = 12; // franja comercial de referencia (09:00–21:00)
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const isEarning = (r: Reservation) => r.status === 'confirmed' || r.status === 'completed';
const netOf = (r: Reservation) => r.subtotalClp - (r.platformFeeClp ?? Math.round(r.subtotalClp * 0.05));
const compactClp = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1).replace('.', ',')}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : formatClp(v);

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return {
    iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    weekday: WEEKDAYS[d.getDay()],
    dayNum: d.getDate(),
  };
};

const formatDay = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export const OwnerOverview: React.FC<OwnerOverviewProps> = ({
  todayIso,
  spaces,
  bookings,
  pendingBookings,
  upcomingVisits,
  blocks,
  onGoTab,
  onOpenCalendar,
}) => {
  const months = useMemo(() => lastMonths(todayIso, 6), [todayIso]);
  const currentMonth = months[months.length - 1].key;
  const previousMonth = months[months.length - 2].key;

  const incomeByMonth = useMemo(() => {
    const map = new Map<string, { net: number; count: number }>();
    for (const r of bookings) {
      if (!isEarning(r)) continue;
      const key = r.startDate.slice(0, 7);
      const prev = map.get(key) || { net: 0, count: 0 };
      map.set(key, { net: prev.net + netOf(r), count: prev.count + 1 });
    }
    return map;
  }, [bookings]);

  const thisMonth = incomeByMonth.get(currentMonth) || { net: 0, count: 0 };
  const lastMonth = incomeByMonth.get(previousMonth) || { net: 0, count: 0 };

  const activeSpaces = useMemo(() => spaces.filter((s) => s.status === 'active'), [spaces]);

  // Ocupación de los próximos 14 días: promedio entre espacios activos de la fracción
  // del día ocupada por reservas (pendientes o confirmadas) o bloqueos del propietario.
  const heatDays = useMemo<HeatDay[]>(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const day = addDays(todayIso, i);
      let resCount = 0;
      let blockCount = 0;
      const fractions = activeSpaces.map((sp) => {
        let hours = 0;
        for (const r of bookings) {
          if (r.spaceId !== sp.id || (r.status !== 'pending' && r.status !== 'confirmed')) continue;
          if (day.iso < r.startDate || day.iso > r.endDate) continue;
          resCount++;
          if (r.rentalModality === 'por_hora' && r.hourStart != null && r.hourEnd != null) hours += r.hourEnd - r.hourStart;
          else hours = OPERATING_HOURS;
        }
        for (const b of blocks) {
          if (b.spaceId !== sp.id || day.iso < b.startDate || day.iso > b.endDate) continue;
          blockCount++;
          hours += b.hourStart != null && b.hourEnd != null ? b.hourEnd - b.hourStart : OPERATING_HOURS;
        }
        return Math.min(1, hours / OPERATING_HOURS);
      });
      const pct = fractions.length ? Math.round((fractions.reduce((a, b) => a + b, 0) / fractions.length) * 100) : 0;
      return {
        ...day,
        pct,
        detail: `${resCount} ${resCount === 1 ? 'reserva' : 'reservas'} · ${blockCount} ${blockCount === 1 ? 'bloqueo' : 'bloqueos'}`,
      };
    });
  }, [todayIso, activeSpaces, bookings, blocks]);

  const avgOccupancy = heatDays.length ? Math.round(heatDays.reduce((a, d) => a + d.pct, 0) / heatDays.length) : 0;

  const upcoming = useMemo(
    () =>
      bookings
        .filter((r) => (r.status === 'pending' || r.status === 'confirmed') && r.endDate >= todayIso)
        .sort((a, b) => (a.startDate + String(a.hourStart ?? 0).padStart(2, '0')).localeCompare(b.startDate + String(b.hourStart ?? 0).padStart(2, '0')))
        .slice(0, 6),
    [bookings, todayIso]
  );

  const ranking = useMemo(() => {
    return spaces
      .map((sp) => {
        const own = bookings.filter((r) => r.spaceId === sp.id && isEarning(r));
        return {
          key: sp.id,
          label: sp.title,
          value: own.reduce((sum, r) => sum + netOf(r), 0),
          detail: `${own.length} ${own.length === 1 ? 'reserva' : 'reservas'} · ${sp.commune}`,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [spaces, bookings]);

  const upcomingBlocks = blocks.filter((b) => b.endDate >= todayIso).length;
  const moderation = spaces.filter((s) => s.status === 'pending_approval').length;
  const paused = spaces.filter((s) => s.status === 'paused').length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Ingresos netos del mes"
          value={formatClp(thisMonth.net)}
          delta={pctChange(thisMonth.net, lastMonth.net)}
          hint="vs. mes anterior"
          icon={<Wallet className="w-4 h-4" />}
          onClick={() => onGoTab('finances')}
        />
        <StatTile
          label="Reservas del mes"
          value={String(thisMonth.count)}
          delta={pctChange(thisMonth.count, lastMonth.count)}
          hint="confirmadas"
          icon={<CalendarCheck className="w-4 h-4" />}
          onClick={() => onGoTab('bookings')}
        />
        <StatTile
          label="Ocupación 14 días"
          value={`${avgOccupancy}%`}
          hint={`${activeSpaces.length} ${activeSpaces.length === 1 ? 'espacio activo' : 'espacios activos'}`}
          icon={<TrendingUp className="w-4 h-4" />}
          onClick={() => onGoTab('calendar')}
        />
        <StatTile
          label="Por aprobar"
          value={String(pendingBookings.length)}
          hint={pendingBookings.length ? 'responde pronto' : 'nada pendiente'}
          icon={<Clock className="w-4 h-4" />}
          tone={pendingBookings.length ? 'attention' : 'default'}
          onClick={() => onGoTab('bookings')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">Ingresos netos por mes</h3>
            <span className="text-[10px] text-slate-500">Últimos 6 meses · después de comisión</span>
          </div>
          <VerticalBarChart
            title="Ingresos netos por mes"
            data={months.map((m) => {
              const v = incomeByMonth.get(m.key) || { net: 0, count: 0 };
              return { key: m.key, label: m.label, value: v.net, detail: `${v.count} ${v.count === 1 ? 'reserva' : 'reservas'}` };
            })}
            formatValue={compactClp}
          />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Pendientes</h3>
          <ActionQueue
            items={[
              { key: 'pending', label: 'Solicitudes por aprobar', count: pendingBookings.length, hint: 'Acepta o rechaza a tiempo', icon: <Clock className="w-4 h-4" />, onClick: () => onGoTab('bookings'), urgent: true },
              { key: 'visits', label: 'Visitas programadas', count: upcomingVisits.length, hint: 'Próximas visitas a tus espacios', icon: <Eye className="w-4 h-4" />, onClick: () => onGoTab('visits') },
              { key: 'moderation', label: 'En moderación', count: moderation, hint: 'Esperan aprobación del administrador', icon: <Building className="w-4 h-4" />, onClick: () => onGoTab('spaces') },
              { key: 'paused', label: 'Publicaciones pausadas', count: paused, hint: 'No reciben reservas', icon: <PauseCircle className="w-4 h-4" />, onClick: () => onGoTab('spaces') },
              { key: 'blocks', label: 'Bloqueos vigentes', count: upcomingBlocks, hint: 'Horas o días no disponibles', icon: <MapPin className="w-4 h-4" />, onClick: () => onGoTab('calendar') },
            ]}
          />
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">Ocupación de los próximos 14 días</h3>
            <span className="text-[10px] text-slate-500">Reservas + bloqueos · todos tus espacios activos</span>
          </div>
          {activeSpaces.length === 0 ? (
            <p className="text-[11px] text-slate-400 py-4 text-center">Cuando tengas espacios activos verás aquí su ocupación.</p>
          ) : (
            <OccupancyHeatStrip
              title="Ocupación diaria próximos 14 días"
              days={heatDays}
              onSelect={(iso) => activeSpaces[0] && onOpenCalendar(activeSpaces[0].id, iso)}
            />
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Tus espacios que más generan</h3>
          <HorizontalBarList
            title="Ingresos netos por espacio"
            data={ranking}
            formatValue={compactClp}
            emptyText="Aún no tienes reservas confirmadas."
            onSelect={(id) => onOpenCalendar(id, todayIso)}
          />
        </section>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">Próximas reservas</h3>
          <button type="button" onClick={() => onGoTab('bookings')} className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer">
            Ver todas →
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-3 text-center">No tienes reservas próximas.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11px] min-w-[520px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="py-2 px-1 font-bold">Fecha</th>
                  <th className="py-2 px-1 font-bold">Espacio</th>
                  <th className="py-2 px-1 font-bold">Arrendatario</th>
                  <th className="py-2 px-1 font-bold text-right">Neto</th>
                  <th className="py-2 px-1 font-bold text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => onOpenCalendar(r.spaceId, r.startDate)}
                  >
                    <td className="py-2 px-1 font-semibold text-slate-800 whitespace-nowrap">
                      {formatDay(r.startDate)}
                      {r.rentalModality === 'por_hora' && r.hourStart != null
                        ? ` · ${String(r.hourStart).padStart(2, '0')}:00–${String(r.hourEnd).padStart(2, '0')}:00`
                        : r.endDate !== r.startDate
                        ? ` al ${formatDay(r.endDate)}`
                        : ''}
                    </td>
                    <td className="py-2 px-1 text-slate-700 truncate max-w-[180px]">{r.spaceTitle}</td>
                    <td className="py-2 px-1 text-slate-600 truncate max-w-[140px]">{r.tenantName}</td>
                    <td className="py-2 px-1 text-right font-bold text-slate-900">{formatClp(netOf(r))}</td>
                    <td className="py-2 px-1 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {r.status === 'confirmed' ? '✓ Confirmada' : '● Por aprobar'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
