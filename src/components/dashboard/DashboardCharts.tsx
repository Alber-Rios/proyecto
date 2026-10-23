// Gráficos livianos para los paneles (sin librerías externas).
// Reglas: una sola serie por gráfico (sin leyenda), marcas finas con extremo
// redondeado, grilla recesiva, etiquetas de texto en tinta neutra (no en el
// color de la serie), tooltip al pasar el cursor/foco y tabla equivalente para
// lectores de pantalla.
import React, { useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion } from '../../lib/motionPreference.ts';
import { AnimatedNumber } from '../motion/AnimatedNumber.tsx';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  detail?: string;
}

// Paleta: un solo tono por gráfico (magnitud), en pasos de Tailwind.
const BAR_COLOR = 'bg-rose-500';
const BAR_COLOR_MUTED = 'bg-rose-200';

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
  const reduce = useReducedMotion();
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
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">{emptyText}</div>
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
                  <motion.span
                    className="absolute text-[10px] font-bold text-slate-700 whitespace-nowrap"
                    style={{ bottom: `calc(${pct}% + 4px)` }}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.5 + i * 0.07, ease: EASE_OUT }}
                  >
                    {formatValue(d.value)}
                  </motion.span>
                )}
                <motion.div
                  className={`w-full max-w-[38px] rounded-t-[4px] origin-bottom transition-[filter,box-shadow] ${
                    i === lastIdx ? BAR_COLOR : BAR_COLOR_MUTED
                  } ${active ? 'ring-2 ring-slate-900/20 brightness-95' : ''}`}
                  initial={reduce ? false : { height: '0%' }}
                  animate={{ height: `${Math.max(pct, d.value > 0 ? 2 : 0)}%` }}
                  transition={{ type: 'spring', duration: 0.9, bounce: 0.18, delay: i * 0.07 }}
                />
                <AnimatePresence>
                  {active && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.16, ease: EASE_OUT }}
                      className="absolute z-10 bottom-full mb-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] shadow-lg whitespace-nowrap pointer-events-none origin-bottom"
                    >
                      <div className="font-bold">{d.label}</div>
                      <div>{formatValue(d.value)}</div>
                      {d.detail && <div className="text-slate-300">{d.detail}</div>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 sm:gap-3 px-1" aria-hidden>
        {data.map((d, i) => (
          <span
            key={d.key}
            className={`flex-1 min-w-0 text-center text-[10px] whitespace-nowrap ${i === lastIdx ? 'font-bold text-slate-800' : 'text-slate-500'} ${
              // Con muchas barras, en pantallas chicas se muestra una etiqueta por medio.
              data.length > 8 && (lastIdx - i) % 2 === 1 ? 'invisible sm:visible' : ''
            }`}
          >
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
  const reduce = useReducedMotion();
  // Solo filas con valor: un ranking con ceros no aporta.
  data = data.filter((d) => d.value > 0);
  const max = Math.max(0, ...data.map((d) => d.value));
  if (data.length === 0 || max === 0) {
    return <p className="text-[11px] text-slate-400 py-4 text-center">{emptyText}</p>;
  }
  return (
    <figure>
      <ul className="space-y-2.5">
        {data.map((d, i) => {
          const Row = onSelect ? 'button' : 'div';
          return (
            <li key={d.key}>
              <Row
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(d.key) } : {})}
                className={`w-full text-left space-y-1 ${onSelect ? 'cursor-pointer group' : ''}`}
                title={d.detail ? `${d.label}: ${formatValue(d.value)} · ${d.detail}` : `${d.label}: ${formatValue(d.value)}`}
              >
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className={`font-semibold text-slate-700 truncate ${onSelect ? 'group-hover:text-slate-950' : ''}`}>{d.label}</span>
                  <AnimatedNumber className="font-bold text-slate-900 whitespace-nowrap" text={formatValue(d.value)} />
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${BAR_COLOR}`}
                    initial={reduce ? false : { width: '0%' }}
                    animate={{ width: `${Math.max(2, (d.value / max) * 100)}%` }}
                    transition={{ duration: 0.9, delay: i * 0.08, ease: EASE_OUT }}
                  />
                </div>
                {d.detail && <div className="text-[10px] text-slate-500 truncate">{d.detail}</div>}
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
  { min: 1, cls: 'bg-indigo-100 text-indigo-900' },
  { min: 25, cls: 'bg-indigo-200 text-indigo-950' },
  { min: 50, cls: 'bg-indigo-400 text-white' },
  { min: 75, cls: 'bg-indigo-600 text-white' },
];
const heatClass = (pct: number) => [...HEAT_STEPS].reverse().find((s) => pct >= s.min)!.cls;

/** Franja de calor de ocupación diaria (p. ej. próximos 14 días). */
export const OccupancyHeatStrip: React.FC<{ title: string; days: HeatDay[]; onSelect?: (iso: string) => void }> = ({
  title,
  days,
  onSelect,
}) => {
  const legendId = useId();
  const reduce = useReducedMotion();
  return (
    <figure className="space-y-2">
      <div className="grid grid-cols-7 gap-1.5" aria-describedby={legendId}>
        {days.map((d, i) => (
          <motion.button
            key={d.iso}
            type="button"
            initial={reduce ? false : { opacity: 0, scale: 0.85, y: 6 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={reduce ? undefined : { y: -2 }}
            transition={{ duration: 0.35, delay: i * 0.03, ease: EASE_OUT }}
            onClick={() => onSelect?.(d.iso)}
            title={`${d.weekday} ${d.dayNum}: ${d.pct}% ocupado · ${d.detail}`}
            className={`rounded-xl p-1.5 text-center transition hover:ring-2 hover:ring-slate-900/20 ${heatClass(d.pct)} ${
              onSelect ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <div className="text-[9px] font-semibold uppercase opacity-80">{d.weekday}</div>
            <div className="text-sm font-extrabold leading-tight">{d.dayNum}</div>
            <div className="text-[9px] font-bold">{d.pct}%</div>
          </motion.button>
        ))}
      </div>
      <div id={legendId} className="flex items-center gap-1.5 text-[10px] text-slate-500">
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
      } ${onClick ? 'cursor-pointer hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition duration-300' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight">{label}</span>
        {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
      </div>
      <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight break-words leading-tight">
        <AnimatedNumber text={value} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] min-h-[16px]">
        {delta != null && Number.isFinite(delta) && (
          <span
            className={`font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
              delta > 0 ? 'bg-emerald-50 text-emerald-700' : delta < 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
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
      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800">
        <span aria-hidden>✓</span> Todo al día: no hay tareas pendientes.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {pending.map((i, idx) => (
        <motion.li
          key={i.key}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: idx * 0.06, ease: EASE_OUT }}
        >
          <button
            type="button"
            onClick={i.onClick}
            className={`group w-full flex items-center gap-3 p-3 rounded-xl border text-left transition cursor-pointer ${
              i.urgent ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/70' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${i.urgent ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
              {i.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-slate-900 truncate">{i.label}</span>
              <span className="block text-[10px] text-slate-500 truncate">{i.hint}</span>
            </span>
            <span className="text-sm font-extrabold text-slate-900">{i.count}</span>
            <span className="text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden>→</span>
          </button>
        </motion.li>
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

/* ------------------------------------------------------------------ */
/* Períodos: ver los paneles por día, semana o mes                     */
/* ------------------------------------------------------------------ */

export type DashboardPeriod = 'day' | 'week' | 'month';

export interface PeriodBucket {
  key: string;
  label: string;
  /** Primer y último día (ISO, inclusive) del período. */
  start: string;
  end: string;
}

export const PERIOD_TEXT: Record<
  DashboardPeriod,
  { current: string; previous: string; per: string; range: string; name: string }
> = {
  day: { current: 'de hoy', previous: 'vs. ayer', per: 'por día', range: 'Últimos 14 días', name: 'Día' },
  week: { current: 'de la semana', previous: 'vs. semana anterior', per: 'por semana', range: 'Últimas 8 semanas', name: 'Semana' },
  month: { current: 'del mes', previous: 'vs. mes anterior', per: 'por mes', range: 'Últimos 6 meses', name: 'Mes' },
};

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoOf(d);
};
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Períodos a mostrar en los gráficos (el último es el actual). */
export function periodBuckets(todayIso: string, period: DashboardPeriod): PeriodBucket[] {
  if (period === 'month') {
    return lastMonths(todayIso, 6).map((m) => {
      const [y, mo] = m.key.split('-').map(Number);
      const last = new Date(y, mo, 0).getDate();
      return { key: m.key, label: m.label, start: `${m.key}-01`, end: `${m.key}-${String(last).padStart(2, '0')}` };
    });
  }
  if (period === 'week') {
    // Semanas de lunes a domingo.
    const today = new Date(`${todayIso}T12:00:00`);
    const monday = shiftDays(todayIso, -((today.getDay() + 6) % 7));
    return Array.from({ length: 8 }, (_, i) => {
      const start = shiftDays(monday, -7 * (7 - i));
      const [, m, d] = start.split('-').map(Number);
      return { key: start, label: `${d} ${MONTH_SHORT[m - 1].toLowerCase()}`, start, end: shiftDays(start, 6) };
    });
  }
  return Array.from({ length: 14 }, (_, i) => {
    const iso = shiftDays(todayIso, -(13 - i));
    const d = new Date(`${iso}T12:00:00`);
    return { key: iso, label: `${DAY_SHORT[d.getDay()]} ${d.getDate()}`, start: iso, end: iso };
  });
}

/** Clave del período al que pertenece una fecha (o null si está fuera del rango). */
export function bucketKeyOf(iso: string, buckets: PeriodBucket[]): string | null {
  const day = iso.slice(0, 10);
  for (const b of buckets) if (day >= b.start && day <= b.end) return b.key;
  return null;
}

/** Selector Día / Semana / Mes, recuerda la elección en este navegador. */
export function usePeriod(storageKey: string, initial: DashboardPeriod = 'month') {
  const [period, setPeriodState] = useState<DashboardPeriod>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === 'day' || saved === 'week' || saved === 'month' ? saved : initial;
    } catch {
      return initial;
    }
  });
  const setPeriod = (p: DashboardPeriod) => {
    setPeriodState(p);
    try {
      localStorage.setItem(storageKey, p);
    } catch {
      /* sin almacenamiento: solo dura esta visita */
    }
  };
  return [period, setPeriod] as const;
}

export const PeriodToggle: React.FC<{ value: DashboardPeriod; onChange: (p: DashboardPeriod) => void; id: string }> = ({
  value,
  onChange,
  id,
}) => (
  <div className="inline-flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Ver por período">
    {(['day', 'week', 'month'] as DashboardPeriod[]).map((p) => {
      const active = value === p;
      return (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(p)}
          className={`relative rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
            active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {active && (
            <motion.span
              layoutId={`period-pill-${id}`}
              className="absolute inset-0 rounded-lg bg-white shadow-sm"
              transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            />
          )}
          <span className="relative">{PERIOD_TEXT[p].name}</span>
        </button>
      );
    })}
  </div>
);
