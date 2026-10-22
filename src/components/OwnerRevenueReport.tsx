import React, { useMemo, useState } from 'react';
import { Reservation } from '../types.ts';
import { formatClp } from '../utils/formatters.ts';
import { buildRevenueCsv, monthlyRevenue, revenueRows } from '../utils/revenueReport.ts';
import { Download, BarChart3 } from 'lucide-react';

// Gráfico de ingresos por mes (RF-27) y exportación del reporte (RF-28).
export const OwnerRevenueReport: React.FC<{ reservations: Reservation[] }> = ({ reservations }) => {
  const [months, setMonths] = useState(6);
  const series = useMemo(() => monthlyRevenue(reservations, months), [reservations, months]);
  const max = Math.max(...series.map((m) => m.net), 1);
  const rows = useMemo(() => revenueRows(reservations), [reservations]);

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

  const chartHeight = 140;
  const barWidth = 36;
  const gap = 18;
  const chartWidth = series.length * (barWidth + gap) + gap;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-600" /> Ingresos netos por mes
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Reservas confirmadas o finalizadas con pago aprobado, descontada la comisión de la plataforma.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-600">
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
          </label>
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`}
          width="100%"
          style={{ minWidth: Math.min(chartWidth, 320), maxHeight: 220 }}
          role="img"
          aria-label="Ingresos netos por mes"
        >
          <line x1={0} x2={chartWidth} y1={chartHeight} y2={chartHeight} stroke="#e2e8f0" />
          {series.map((m, i) => {
            const h = Math.round((m.net / max) * (chartHeight - 20));
            const x = gap + i * (barWidth + gap);
            return (
              <g key={m.key}>
                <title>{`${m.label}: ${formatClp(m.net)} (${m.count} reservas)`}</title>
                <rect x={x} y={chartHeight - h} width={barWidth} height={Math.max(h, m.net > 0 ? 2 : 0)} rx={6} fill="#e11d48" />
                <text x={x + barWidth / 2} y={chartHeight + 14} textAnchor="middle" fontSize={10} fill="#64748b">
                  {m.label}
                </text>
                {m.net > 0 && (
                  <text x={x + barWidth / 2} y={chartHeight - h - 4} textAnchor="middle" fontSize={9} fill="#0f172a">
                    {Math.round(m.net / 1000)}k
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-[12.5px] text-slate-500">
        {rows.length} {rows.length === 1 ? 'reserva incluida' : 'reservas incluidas'} en el reporte exportable · Total neto{' '}
        <strong className="text-slate-900">{formatClp(rows.reduce((sum, r) => sum + r.net, 0))}</strong>
      </p>
    </div>
  );
};
