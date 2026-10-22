// Gráficos livianos para los paneles (sin librerías externas).
// Reglas: una sola serie por gráfico (sin leyenda), marcas finas con extremo
// redondeado, grilla recesiva, etiquetas de texto en tinta neutra (no en el
// color de la serie), tooltip al pasar el cursor/foco y tabla equivalente para
// lectores de pantalla.
import React, { useId, useState } from 'react';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  detail?: string;
}

// Paleta: un solo tono por gráfico (magnitud), en pasos de Tailwind.
const BAR_COLOR = 'bg-brand-500';
const BAR_COLOR_MUTED = 'bg-brand-200';

const SrTable: React.FC<{ caption: string; rows: { label: string; value: string }[] }> = ({ caption, rows }) => (
  <table className="sr-only">
    <caption>{caption}</caption>
    <tbody>
      {rows.map((r) => (
        <tr key={r.label}>
          <th scope="row">{r.label}</th>
          <td>{r.value}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/** Barras verticales (p. ej. ingresos por mes). Resalta la última barra (período actual). */
export const VerticalBarChart: React.FC<{
  title: string;
  data: BarDatum[];
  formatValue: (v: number) => string;
  height?: number;
  emptyText?: string;
}> = ({ title, data, formatValue, height = 160, emptyText = 'Aún no hay datos para este período.' }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const hasData = max > 0;
  const lastIdx = data.length - 1;

  return (
    <figure className="space-y-2 pt-5">
      <div className="relative" style={{ height }}>
        {/* Grilla recesiva: base y mitad */}
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-300" aria-hidden />
        <div className="absolute inset-x-0 border-t border-dashed border-slate-100" style={{ bottom: height / 2 }} aria-hidden />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-slate-400">{emptyText}</div>
        )}
        <div className="absolute inset-0 flex items-end gap-2 sm:gap-3 px-1" role="presentation">
          {data.map((d, i) => {
            const pct = hasData ? (d.value / max) * 100 : 0;
            const active = hover === i;
            return (
              <div
                key={d.key}
                className="relative flex-1 h-full flex items-end justify-center outline-none"
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${d.label}: ${formatValue(d.value)}`}
              >
                {/* La etiqueta solo en la barra actual y la máxima, para no saturar */}
                {hasData && (i === lastIdx || d.value === max) && d.value > 0 && !active && (
                  <span
                    className="absolute text-[11.5px] font-semibold text-slate-700 whitespace-nowrap"
                    style={{ bottom: `calc(${pct}% + 4px)` }}
                  >
                    {formatValue(d.value)}
                  </span>
                )}
                <div
                  className={`w-full max-w-[38px] rounded-t-[4px] transition-all ${
                    i === lastIdx ? BAR_COLOR : BAR_COLOR_MUTED
                  } ${active ? 'ring-2 ring-slate-900/20' : ''}`}
                  style={{ height: `${Math.max(pct, d.value > 0 ? 2 : 0)}%` }}
                />
                {active && (
                  <div className="absolute z-10 bottom-full mb-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11.5px] shadow-lg whitespace-nowrap pointer-events-none">
                    <div className="font-semibold">{d.label}</div>
                    <div>{formatValue(d.value)}</div>
                    {d.detail && <div className="text-slate-300">{d.detail}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 sm:gap-3 px-1" aria-hidden>
        {data.map((d, i) => (
          <span key={d.key} className={`flex-1 text-center text-[11.5px] ${i === lastIdx ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
            {d.label}
          </span>
        ))}
      </div>
      <SrTable caption={title} rows={data.map((d) => ({ label: d.label, value: formatValue(d.value) }))} />
    </figure>
  );
};

/** Barras horizontales para rankings (top espacios, comunas, estados). */
export const HorizontalBarList: React.FC<{
  title: string;
  data: BarDatum[];
  formatValue: (v: number) => string;
  emptyText?: string;
  onSelect?: (key: string) => void;
}> = ({ title, data, formatValue, emptyText = 'Sin datos todavía.', onSelect }) => {
  // Solo filas con valor: un ranking con ceros no aporta.
  data = data.filter((d) => d.value > 0);
  const max = Math.max(0, ...data.map((d) => d.value));
  if (data.length === 0 || max === 0) {
    return <p className="text-[12.5px] text-slate-400 py-4 text-center">{emptyText}</p>;
  }
  return (
    <figure>
      <ul className="space-y-2.5">
        {data.map((d) => {
          const Row = onSelect ? 'button' : 'div';
          return (
            <li key={d.key}>
              <Row
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(d.key) } : {})}
                className={`w-full text-left space-y-1 ${onSelect ? 'cursor-pointer group' : ''}`}
                title={d.detail ? `${d.label}: ${formatValue(d.value)} · ${d.detail}` : `${d.label}: ${formatValue(d.value)}`}
              >
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className={`font-semibold text-slate-700 truncate ${onSelect ? 'group-hover:text-slate-950' : ''}`}>{d.label}</span>
                  <span className="font-semibold text-slate-900 whitespace-nowrap">{formatValue(d.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${BAR_COLOR}`} style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }} />
                </div>
                {d.detail && <div className="text-[11.5px] text-slate-500 truncate">{d.detail}</div>}
              </Row>
            </li>
          );
        })}
      </ul>
      <SrTable caption={title} rows={data.map((d) => ({ label: d.label, value: formatValue(d.value) }))} />
    </figure>
  );
};

export interface HeatDay {
  iso: string;
  weekday: string;
  dayNum: number;
  pct: number; // 0..100
  detail: string;
}

// Escala secuencial de un solo tono (claro → oscuro) para la ocupación.
const HEAT_STEPS = [
  { min: 0, cls: 'bg-slate-100 text-slate-500' },
  { min: 1, cls: 'bg-brand-100 text-brand-900' },
  { min: 25, cls: 'bg-brand-200 text-brand-950' },
  { min: 50, cls: 'bg-brand-400 text-white' },
  { min: 75, cls: 'bg-brand-600 text-white' },
];
const heatClass = (pct: number) => [...HEAT_STEPS].reverse().find((s) => pct >= s.min)!.cls;

/** Franja de calor de ocupación diaria (p. ej. próximos 14 días). */
export const OccupancyHeatStrip: React.FC<{ title: string; days: HeatDay[]; onSelect?: (iso: string) => void }> = ({
  title,
  days,
  onSelect,
}) => {
  const legendId = useId();
  return (
    <figure className="space-y-2">
      <div className="grid grid-cols-7 gap-1.5" aria-describedby={legendId}>
        {days.map((d) => (
          <button
            key={d.iso}
            type="button"
            onClick={() => onSelect?.(d.iso)}
            title={`${d.weekday} ${d.dayNum}: ${d.pct}% ocupado · ${d.detail}`}
            className={`rounded-xl p-1.5 text-center transition hover:ring-2 hover:ring-slate-900/20 ${heatClass(d.pct)} ${
              onSelect ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <div className="text-[10.5px] font-semibold uppercase opacity-80">{d.weekday}</div>
            <div className="text-sm font-semibold leading-tight">{d.dayNum}</div>
            <div className="text-[10.5px] font-semibold">{d.pct}%</div>
          </button>
        ))}
      </div>
      <div id={legendId} className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
        <span>Libre</span>
        {HEAT_STEPS.map((s) => (
          <span key={s.min} className={`w-4 h-2.5 rounded-sm ${s.cls.split(' ')[0]}`} aria-hidden />
        ))}
        <span>Lleno</span>
      </div>
      <SrTable caption={title} rows={days.map((d) => ({ label: `${d.weekday} ${d.dayNum}`, value: `${d.pct}% ocupado` }))} />
    </figure>
  );
};

/** Tarjeta de indicador: número grande + variación opcional frente al período anterior. */
export const StatTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  delta?: number | null; // % vs período anterior
  icon?: React.ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'attention';
}> = ({ label, value, hint, delta, icon, onClick, tone = 'default' }) => {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`text-left p-4 rounded-2xl border bg-white shadow-2xs flex flex-col gap-2 min-w-0 ${
        tone === 'attention' ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
      } ${onClick ? 'cursor-pointer hover:border-slate-300 hover:shadow-xs transition' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">{label}</span>
        {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
      </div>
      <div className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight break-words leading-tight">{value}</div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] min-h-[16px]">
        {delta != null && Number.isFinite(delta) && (
          <span
            className={`font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
              delta > 0 ? 'bg-emerald-50 text-emerald-700' : delta < 0 ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(Math.round(delta))}%
          </span>
        )}
        {hint && <span className="text-slate-500">{hint}</span>}
      </div>
    </Wrapper>
  );
};

/** Lista de pendientes accionables (centro de acciones). */
export const ActionQueue: React.FC<{
  items: { key: string; label: string; count: number; hint: string; icon: React.ReactNode; onClick: () => void; urgent?: boolean }[];
}> = ({ items }) => {
  const pending = items.filter((i) => i.count > 0);
  if (pending.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[12.5px] font-semibold text-emerald-800">
        <span aria-hidden>✓</span> Todo al día: no hay tareas pendientes.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {pending.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            onClick={i.onClick}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
              i.urgent ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/70' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${i.urgent ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
              {i.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate-900 truncate">{i.label}</span>
              <span className="block text-[11.5px] text-slate-500 truncate">{i.hint}</span>
            </span>
            <span className="text-sm font-semibold text-slate-900">{i.count}</span>
            <span className="text-slate-400" aria-hidden>→</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

/** Helpers de fechas para agrupar por mes (zona de Chile ya aplicada en los ISO). */
export const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function lastMonths(todayIso: string, count: number): { key: string; label: string }[] {
  const [y, m] = todayIso.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const offset = count - 1 - i;
    const total = y * 12 + (m - 1) - offset;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    return { key: `${year}-${String(month).padStart(2, '0')}`, label: MONTH_SHORT[month - 1] };
  });
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
