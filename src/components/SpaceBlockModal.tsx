import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, Clock, CalendarDays, Lock, Loader2, Trash2, Wrench, X } from 'lucide-react';
import type { Space, SpaceBlock } from '../types.ts';
import { useChileNow } from '../hooks/useChileNow.ts';
import { describeBlock } from '../utils/spaceBlocks.ts';

type BlockMode = 'hours' | 'days' | 'month';

interface SpaceBlockModalProps {
  space: Space;
  initialDate?: string;
  blocks: SpaceBlock[];
  onClose: () => void;
  onAdd: (block: Omit<SpaceBlock, 'id' | 'ownerId' | 'createdAt'>) => Promise<{ success: boolean; message?: string }>;
  onRemove: (id: string) => Promise<{ success: boolean; message?: string }>;
}

const HOURS = Array.from({ length: 15 }, (_, i) => 8 + i); // 08:00 … 22:00
const REASONS = ['Mantención', 'Limpieza / sanitización', 'Uso personal', 'Evento privado'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const pad = (n: number) => String(n).padStart(2, '0');
const hourLabel = (h: number) => `${pad(h)}:00`;

export const SpaceBlockModal: React.FC<SpaceBlockModalProps> = ({ space, initialDate, blocks, onClose, onAdd, onRemove }) => {
  const now = useChileNow();
  const todayIso = now.iso;
  const startIso = initialDate && initialDate >= todayIso ? initialDate : todayIso;

  const [mode, setMode] = useState<BlockMode>('hours');
  const [date, setDate] = useState(startIso);
  const [hourStart, setHourStart] = useState(9);
  const [hourEnd, setHourEnd] = useState(13);
  const [rangeStart, setRangeStart] = useState(startIso);
  const [rangeEnd, setRangeEnd] = useState(startIso);
  const [monthKey, setMonthKey] = useState(startIso.slice(0, 7));
  const [reason, setReason] = useState('Mantención');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Horas de inicio posibles: si el día es hoy, solo las que aún no comienzan.
  const startOptions = useMemo(
    () => HOURS.filter((h) => h < 22 && (date !== todayIso || h > now.hour)),
    [date, todayIso, now.hour]
  );
  const endOptions = useMemo(() => HOURS.filter((h) => h > hourStart), [hourStart]);

  const monthOptions = useMemo(() => {
    const [y, m] = todayIso.split('-').map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const year = y + Math.floor((m - 1 + i) / 12);
      const month = ((m - 1 + i) % 12) + 1;
      return { key: `${year}-${pad(month)}`, label: `${MONTH_NAMES[month - 1]} ${year}` };
    });
  }, [todayIso]);

  const monthRange = useMemo(() => {
    const [y, m] = monthKey.split('-').map(Number);
    const first = `${monthKey}-01`;
    const last = `${monthKey}-${pad(new Date(y, m, 0).getDate())}`;
    return { start: first < todayIso ? todayIso : first, end: last };
  }, [monthKey, todayIso]);

  const upcomingBlocks = useMemo(
    () =>
      blocks
        .filter((b) => b.spaceId === space.id && b.endDate >= todayIso)
        .sort((a, b) => (a.startDate + (a.hourStart ?? 0)).localeCompare(b.startDate + (b.hourStart ?? 0))),
    [blocks, space.id, todayIso]
  );

  // Mantiene una selección de horas válida al cambiar la fecha o la hora de inicio.
  const effectiveStart = startOptions.includes(hourStart) ? hourStart : startOptions[0];
  const effectiveEnd = effectiveStart !== undefined && hourEnd > effectiveStart ? hourEnd : (effectiveStart ?? 8) + 1;

  const preview = (() => {
    if (mode === 'hours') {
      return effectiveStart === undefined
        ? null
        : describeBlock({ id: '', spaceId: space.id, startDate: date, endDate: date, hourStart: effectiveStart, hourEnd: effectiveEnd, reason });
    }
    if (mode === 'days') {
      return describeBlock({ id: '', spaceId: space.id, startDate: rangeStart, endDate: rangeEnd, reason });
    }
    return describeBlock({ id: '', spaceId: space.id, startDate: monthRange.start, endDate: monthRange.end, reason });
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    let block: Omit<SpaceBlock, 'id' | 'ownerId' | 'createdAt'>;
    if (mode === 'hours') {
      if (effectiveStart === undefined) {
        setError('Ya no quedan horas por bloquear hoy. Elige otra fecha.');
        return;
      }
      block = { spaceId: space.id, startDate: date, endDate: date, hourStart: effectiveStart, hourEnd: effectiveEnd, reason };
    } else if (mode === 'days') {
      if (rangeEnd < rangeStart) {
        setError('La fecha "hasta" debe ser igual o posterior a la fecha "desde".');
        return;
      }
      block = { spaceId: space.id, startDate: rangeStart, endDate: rangeEnd, reason };
    } else {
      block = { spaceId: space.id, startDate: monthRange.start, endDate: monthRange.end, reason };
    }

    setSaving(true);
    const result = await onAdd(block);
    setSaving(false);
    if (!result.success) {
      setError(result.message || 'No se pudo guardar el bloqueo.');
      return;
    }
    setSuccess(`Bloqueado: ${describeBlock({ ...block, id: '' })}`);
  };

  const handleRemove = async (id: string) => {
    setError(null);
    setSuccess(null);
    setRemovingId(id);
    const result = await onRemove(id);
    setRemovingId(null);
    if (!result.success) setError(result.message || 'No se pudo quitar el bloqueo.');
  };

  const tabClass = (active: boolean) =>
    `flex-1 py-2 px-2 rounded-lg text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
      active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
    }`;
  const inputClass =
    'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-brand-500 focus:outline-none bg-white';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl border border-slate-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="space-block-title"
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="space-block-title" className="text-sm font-semibold text-slate-900">
                Bloquear disponibilidad
              </h3>
              <p className="text-[12.5px] text-slate-500 truncate">{space.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button type="button" className={tabClass(mode === 'hours')} onClick={() => setMode('hours')}>
            <Clock className="w-3.5 h-3.5" /> Horas
          </button>
          <button type="button" className={tabClass(mode === 'days')} onClick={() => setMode('days')}>
            <CalendarRange className="w-3.5 h-3.5" /> Días
          </button>
          <button type="button" className={tabClass(mode === 'month')} onClick={() => setMode('month')}>
            <CalendarDays className="w-3.5 h-3.5" /> Mes completo
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {mode === 'hours' && (
            <div className="space-y-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Día</label>
                <input
                  type="date"
                  min={todayIso}
                  value={date}
                  onChange={(e) => e.target.value >= todayIso && setDate(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Desde</label>
                  <select
                    value={effectiveStart ?? ''}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setHourStart(v);
                      if (hourEnd <= v) setHourEnd(v + 1);
                    }}
                    className={inputClass}
                    disabled={startOptions.length === 0}
                  >
                    {startOptions.length === 0 && <option value="">Sin horas</option>}
                    {startOptions.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Hasta</label>
                  <select
                    value={effectiveEnd}
                    onChange={(e) => setHourEnd(Number(e.target.value))}
                    className={inputClass}
                    disabled={startOptions.length === 0}
                  >
                    {endOptions
                      .filter((h) => effectiveStart === undefined || h > effectiveStart)
                      .map((h) => (
                        <option key={h} value={h}>
                          {hourLabel(h)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              {date === todayIso && (
                <p className="text-[11.5px] text-slate-500">Hoy solo puedes bloquear horas que aún no comienzan.</p>
              )}
            </div>
          )}

          {mode === 'days' && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Desde</label>
                <input
                  type="date"
                  min={todayIso}
                  value={rangeStart}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v < todayIso) return;
                    setRangeStart(v);
                    if (rangeEnd < v) setRangeEnd(v);
                  }}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Hasta</label>
                <input
                  type="date"
                  min={rangeStart}
                  value={rangeEnd}
                  onChange={(e) => e.target.value >= rangeStart && setRangeEnd(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </div>
          )}

          {mode === 'month' && (
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Mes</label>
              <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className={inputClass}>
                {monthOptions.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              {monthKey === todayIso.slice(0, 7) && (
                <p className="text-[11.5px] text-slate-500 mt-1">El mes actual se bloquea desde hoy hasta fin de mes.</p>
              )}
            </div>
          )}

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Motivo</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded-lg border text-[11.5px] font-semibold cursor-pointer transition ${
                    reason === r ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: pintura del recinto"
              className={inputClass}
            />
          </div>

          {preview && (
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900">
              Se bloqueará: <strong>{preview}</strong>. Nadie podrá reservar en ese período.
            </div>
          )}
          {error && (
            <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-[12.5px] font-semibold text-red-800" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[12.5px] font-semibold text-emerald-800" role="status">
              {success}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={saving || (mode === 'hours' && effectiveStart === undefined)}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-semibold cursor-pointer transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Bloquear
            </button>
          </div>
        </form>

        <div className="pt-3 border-t border-slate-100 space-y-2">
          <h4 className="text-[12.5px] font-semibold text-slate-600">Bloqueos vigentes de este espacio ({upcomingBlocks.length})</h4>
          {upcomingBlocks.length === 0 ? (
            <p className="text-[12.5px] text-slate-400">No hay bloqueos programados.</p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {upcomingBlocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 text-[12.5px]">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">{describeBlock(b)}</div>
                    {b.reason && <div className="text-slate-500 truncate">{b.reason}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(b.id)}
                    disabled={removingId === b.id}
                    className="shrink-0 px-2 py-1 rounded-lg text-red-700 hover:bg-red-50 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {removingId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
