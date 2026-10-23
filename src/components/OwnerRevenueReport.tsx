import React, { useMemo, useState } from 'react';
import { Reservation } from '../types.ts';
import { formatClp, getTodayIso } from '../utils/formatters.ts';
import { buildRevenueCsv, revenueRows } from '../utils/revenueReport.ts';
import { lastMonths, bucketKeyOf, periodBuckets, PeriodToggle, PERIOD_TEXT, usePeriod, VerticalBarChart } from './dashboard/DashboardCharts.tsx';
import { Download, BarChart3 } from 'lucide-react';

const compactClp = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1).replace('.', ',')}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : formatClp(v);

// Gráfico de ingresos por día, semana o mes (RF-27) y exportación del reporte (RF-28).
export const OwnerRevenueReport: React.FC<{ reservations: Reservation[] }> = ({ reservations }) => {
  const [period, setPeriod] = usePeriod('spotly-owner-revenue-period');
  const [months, setMonths] = useState(6);
  const todayIso = getTodayIso();
  const rows = useMemo(() => revenueRows(reservations), [reservations]);
  const buckets = useMemo(() => {
    if (period !== 'month') return periodBuckets(todayIso, period);
    return lastMonths(todayIso, months).map((m) => {
      const [y, mo] = m.key.split('-').map(Number);
      return { key: m.key, label: m.label, start: `${m.key}-01`, end: `${m.key}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}` };
    });
  }, [todayIso, period, months]);
  const series = useMemo(() => {
    const map = new Map<string, { net: number; count: number }>();
    for (const r of rows) {
      const k = bucketKeyOf(r.startDate, buckets);
      if (!k) continue;
      const v = map.get(k) || { net: 0, count: 0 };
      map.set(k, { net: v.net + r.net, count: v.count + 1 });
    }
    return buckets.map((b) => {
      const v = map.get(b.key) || { net: 0, count: 0 };
      return { key: b.key, label: b.label, value: v.net, detail: `${v.count} ${v.count === 1 ? 'reserva' : 'reservas'}` };
    });
  }, [rows, buckets]);

  const handleExport = () => {
    const csv = buildRevenueCsv(rows);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ingresos_Spotly_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-rose-600" /> Ingresos netos {PERIOD_TEXT[period].per}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Reservas confirmadas o finalizadas con pago aprobado, descontada la comisión de la plataforma.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodToggle id="owner-revenue" value={period} onChange={setPeriod} />
          {period === 'month' && <label className="text-xs text-slate-600">
            <span className="sr-only">Período</span>
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
            >
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
            </select>
          </label>}
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      <VerticalBarChart
        key={`${period}-${months}`}
        title={`Ingresos netos ${PERIOD_TEXT[period].per}`}
        data={series}
        formatValue={compactClp}
        height={170}
      />

      <p className="text-[11px] text-slate-500">
        {rows.length} {rows.length === 1 ? 'reserva incluida' : 'reservas incluidas'} en el reporte exportable · Total neto{' '}
        <strong className="text-slate-900">{formatClp(rows.reduce((sum, r) => sum + r.net, 0))}</strong>
      </p>
    </div>
  );
};
