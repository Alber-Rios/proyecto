import React, { useCallback, useEffect, useState } from 'react';
import { Sensitive } from '../Sensitive.tsx';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Copy, Landmark, Loader2, Undo2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { formatClp, formatRut, getTodayIso } from '../../utils/formatters.ts';
import { useReducedMotion } from '../../lib/motionPreference.ts';
import {
  accountTypeLabel,
  getPayoutWeek,
  getRefundTransfers,
  markRefundTransferPaid,
  nextTuesdayIso,
  payOwnerWeek,
  requestRefundTransfer,
  type AdminRefundTransfer,
  type BankAccount,
  type PayoutWeek,
  type RefundCandidate,
} from '../../lib/financeApi.ts';

// Salida de dinero: depósitos de los martes a propietarios y devoluciones por
// transferencia a arrendatarios. Cada acción queda en la auditoría.

const card = 'rounded-2xl border border-slate-200 bg-white';
const input = 'min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm';
const longDate = (iso: string) => {
  const t = new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Datos para copiar y transferir desde el banco. */
const BankBox: React.FC<{ bank: BankAccount | null; amount: number }> = ({ bank, amount }) => {
  const [copied, setCopied] = useState(false);
  if (!bank) {
    return (
      <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> Aún no registra su cuenta bancaria
      </p>
    );
  }
  const text = [
    bank.holderName,
    `RUT ${formatRut(bank.holderRut)}`,
    bank.bank,
    `${accountTypeLabel(bank.accountType)} ${bank.accountNumber}`,
    bank.email || '',
    `Monto ${formatClp(amount)}`,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <span className="leading-relaxed">
        <span className="font-semibold text-slate-900">{bank.holderName}</span> · RUT <Sensitive kind="rut" value={bank.holderRut} />
        <br />
        {bank.bank} · {accountTypeLabel(bank.accountType)} <Sensitive kind="account" value={bank.accountNumber} className="font-mono" />
        {bank.email ? <> · <Sensitive kind="email" value={bank.email} /></> : null}
      </span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-semibold text-slate-800 hover:bg-white cursor-pointer"
      >
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        {copied ? 'Copiado' : 'Copiar datos'}
      </button>
    </div>
  );
};

export const WeeklyPayoutsPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const reduce = useReducedMotion();
  const [week, setWeek] = useState(() => nextTuesdayIso(getTodayIso()));
  const [data, setData] = useState<PayoutWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getPayoutWeek(week)
      .then(setData)
      .catch((e: Error) =>
        setError(/does not exist|Could not find the function/i.test(e.message) ? 'Falta actualizar la base: ejecuta supabase/reset-and-setup.sql en Supabase.' : e.message)
      )
      .finally(() => setLoading(false));
  }, [week]);
  useEffect(load, [load]);

  const pay = async (ownerId: string) => {
    const ref = (refs[ownerId] || '').trim();
    if (ref.length < 3) {
      setNotice('Escribe el número del comprobante de la transferencia antes de marcarla.');
      return;
    }
    setBusy(ownerId);
    try {
      const r = await payOwnerWeek(ownerId, week, ref);
      setNotice(`Depósito registrado: ${formatClp(r.amountClp)} (${r.count} ${r.count === 1 ? 'arriendo' : 'arriendos'}). Se avisó al propietario.`);
      setRefs((x) => ({ ...x, [ownerId]: '' }));
      load();
      onChanged?.();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(null);
    }
  };

  const total = data?.owners.reduce((n, o) => n + o.totalClp, 0) ?? 0;
  const isToday = week === getTodayIso();

  return (
    <section aria-labelledby="pay-week" className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h3 id="pay-week" className="flex items-center gap-2 text-base font-bold text-slate-900">
            <CalendarClock className="h-5 w-5 text-slate-500" aria-hidden="true" /> Depósitos del martes
          </h3>
          <p className="text-sm text-slate-600">
            Lo ganado se retiene y se deposita cada martes: entran los arriendos terminados hasta el lunes anterior. Haz una transferencia por
            propietario y registra el comprobante.
          </p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Elegir martes">
          <button type="button" onClick={() => setWeek((w) => addDays(w, -7))} className={`${input} cursor-pointer`} aria-label="Martes anterior">
            ‹
          </button>
          <span className="min-w-[11rem] text-center text-sm font-semibold text-slate-900">
            {longDate(week)}
            {isToday && <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold normal-case text-rose-800">hoy</span>}
          </span>
          <button type="button" onClick={() => setWeek((w) => addDays(w, 7))} className={`${input} cursor-pointer`} aria-label="Martes siguiente">
            ›
          </button>
        </div>
      </div>

      {error && <p role="alert" className="mx-5 mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
      {notice && <p role="status" className="mx-5 mb-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-800">{notice}</p>}

      {loading && !data ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…</p>
      ) : data ? (
        <>
          <dl className="grid grid-cols-2 gap-3 border-y border-slate-100 bg-slate-50/60 px-5 py-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-slate-500">A depositar este martes</dt><dd className="text-lg font-bold tabular-nums">{formatClp(total)}</dd></div>
            <div><dt className="text-xs text-slate-500">Propietarios</dt><dd className="text-lg font-bold tabular-nums">{data.owners.length}</dd></div>
            <div><dt className="text-xs text-slate-500">Sin cuenta registrada</dt><dd className={`text-lg font-bold tabular-nums ${data.owners.some((o) => !o.bank) ? 'text-amber-800' : ''}`}>{data.owners.filter((o) => !o.bank).length}</dd></div>
            <div><dt className="text-xs text-slate-500">Para martes siguientes</dt><dd className="text-lg font-bold tabular-nums">{formatClp(data.upcomingClp)}</dd></div>
          </dl>

          {data.owners.length === 0 ? (
            <p className="flex items-center gap-2 p-5 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> No hay depósitos pendientes para este martes.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.owners.map((o) => {
                const expanded = open === o.ownerId;
                return (
                  <li key={o.ownerId} className="space-y-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">
                          {o.ownerName}
                          {o.overdue && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">incluye atrasado</span>}
                        </p>
                        <p className="text-xs text-slate-500"><Sensitive kind="email" value={o.ownerEmail} /></p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold tabular-nums text-slate-950">{formatClp(o.totalClp)}</p>
                        <button
                          type="button"
                          onClick={() => setOpen(expanded ? null : o.ownerId)}
                          aria-expanded={expanded}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          {o.count} {o.count === 1 ? 'arriendo' : 'arriendos'}
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.ul
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden rounded-xl border border-slate-100 text-sm"
                        >
                          {o.items.map((i) => (
                            <li key={i.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
                              <span className="min-w-0">
                                <span className="block truncate text-slate-900">{i.spaceTitle || 'Espacio'}</span>
                                <span className="font-mono text-xs text-slate-500">{i.reservationId}</span>
                              </span>
                              <span className="text-right tabular-nums text-slate-700">
                                {formatClp(i.grossClp)} − {formatClp(i.ownerCommissionClp)} = <strong className="text-slate-950">{formatClp(i.amountClp)}</strong>
                              </span>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>

                    <BankBox bank={o.bank} amount={o.totalClp} />

                    <div className="flex flex-wrap gap-2">
                      <label className="sr-only" htmlFor={`wk-${o.ownerId}`}>Comprobante de la transferencia</label>
                      <input
                        id={`wk-${o.ownerId}`}
                        value={refs[o.ownerId] || ''}
                        onChange={(e) => setRefs((r) => ({ ...r, [o.ownerId]: e.target.value }))}
                        placeholder="N° de comprobante"
                        disabled={!o.bank}
                        className={`${input} w-48 disabled:bg-slate-50`}
                      />
                      <button
                        type="button"
                        onClick={() => pay(o.ownerId)}
                        disabled={!o.bank || busy === o.ownerId}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.97] disabled:opacity-50 cursor-pointer"
                      >
                        {busy === o.ownerId && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Marcar depositado
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {data.onHold.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-4 text-sm">
              <p className="font-semibold text-rose-900">Retenidas por un reclamo ({data.onHold.length})</p>
              <p className="text-slate-600">Pasan al martes siguiente cuando se resuelva el reclamo.</p>
              <ul className="mt-2 space-y-1">
                {data.onHold.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2 text-slate-700">
                    <span>{h.ownerName} · <span className="font-mono text-xs">{h.reservationId}</span></span>
                    <span className="tabular-nums">{formatClp(h.amountClp)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.history.length > 0 && (
            <details className="border-t border-slate-100 px-5 py-4 text-sm">
              <summary className="cursor-pointer font-semibold text-slate-800">Depósitos ya hechos</summary>
              <ul className="mt-2 divide-y divide-slate-100">
                {data.history.map((h, k) => (
                  <li key={k} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {h.ownerName} · {new Date(h.paidAt).toLocaleDateString('es-CL')}
                      {h.reference && <span className="ml-1 font-mono text-xs text-slate-500">({h.reference})</span>}
                    </span>
                    <span className="font-semibold tabular-nums">{formatClp(h.totalClp)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : null}
    </section>
  );
};

export const RefundTransfersPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [items, setItems] = useState<AdminRefundTransfer[]>([]);
  const [candidates, setCandidates] = useState<RefundCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getRefundTransfers()
      .then((d) => {
        setItems(d.items);
        setCandidates(d.candidates);
        setError(null);
      })
      .catch((e: Error) =>
        setError(/does not exist|Could not find the function/i.test(e.message) ? 'Falta actualizar la base: ejecuta supabase/reset-and-setup.sql en Supabase.' : e.message)
      );
  }, []);
  useEffect(load, [load]);

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      setNotice(ok);
      load();
      onChanged?.();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(null);
    }
  };

  const open = items.filter((i) => i.status !== 'paid');
  const done = items.filter((i) => i.status === 'paid');
  if (!error && open.length === 0 && candidates.length === 0 && done.length === 0) return null;

  return (
    <section aria-labelledby="ref-tr" className={`${card} overflow-hidden`}>
      <div className="p-5">
        <h3 id="ref-tr" className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Undo2 className="h-5 w-5 text-slate-500" aria-hidden="true" /> Reembolsos por transferir
        </h3>
        <p className="text-sm text-slate-600">
          Devoluciones que no pudieron volver a la tarjeta. Spotly le pide los datos al arrendatario; transfiere y registra el comprobante.
        </p>
      </div>
      {error && <p role="alert" className="mx-5 mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
      {notice && <p role="status" className="mx-5 mb-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-800">{notice}</p>}

      {open.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {open.map((t) => (
            <li key={t.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{t.tenantName}</p>
                  <p className="text-xs text-slate-500">
                    {t.spaceTitle || 'Espacio'} · <span className="font-mono">{t.reservationId}</span>
                    {t.reason ? ` · ${t.reason}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold tabular-nums">{formatClp(t.amountClp)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${t.status === 'awaiting_data' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
                    {t.status === 'awaiting_data' ? 'Esperando sus datos' : 'Lista para transferir'}
                  </span>
                </div>
              </div>
              <BankBox bank={t.bank} amount={t.amountClp} />
              <div className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor={`rt-${t.id}`}>Comprobante de la transferencia</label>
                <input
                  id={`rt-${t.id}`}
                  value={refs[t.id] || ''}
                  onChange={(e) => setRefs((r) => ({ ...r, [t.id]: e.target.value }))}
                  placeholder="N° de comprobante"
                  disabled={t.status !== 'pending'}
                  className={`${input} w-48 disabled:bg-slate-50`}
                />
                <button
                  type="button"
                  disabled={t.status !== 'pending' || busy === t.id}
                  onClick={() => {
                    const ref = (refs[t.id] || '').trim();
                    if (ref.length < 3) return setNotice('Escribe el número del comprobante antes de marcarla.');
                    act(t.id, () => markRefundTransferPaid(t.id, ref), 'Devolución registrada como transferida. Se avisó al arrendatario.');
                  }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.97] disabled:opacity-50 cursor-pointer"
                >
                  {busy === t.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Marcar transferida
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-4 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-slate-900">
            <Landmark className="h-4 w-4 text-slate-500" aria-hidden="true" /> Devoluciones a tarjeta aún pendientes
          </p>
          <p className="text-slate-600">Si Transbank no logra devolverlas, pásalas a transferencia.</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {candidates.map((c) => (
              <li key={c.reservationId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {c.tenantName} · {c.spaceTitle || 'Espacio'} · <span className="font-mono text-xs">{c.reservationId}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatClp(c.amountClp)}</span>
                  <button
                    type="button"
                    disabled={busy === c.reservationId}
                    onClick={() =>
                      act(c.reservationId, () => requestRefundTransfer(c.reservationId, 'Pasada a transferencia por administración'), 'Se pidieron los datos bancarios al arrendatario.')
                    }
                    className="min-h-9 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    Pasar a transferencia
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {done.length > 0 && (
        <details className="border-t border-slate-100 px-5 py-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-800">Devoluciones transferidas (90 días)</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {done.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {t.tenantName} · {t.paidAt ? new Date(t.paidAt).toLocaleDateString('es-CL') : ''}
                  {t.transferReference && <span className="ml-1 font-mono text-xs text-slate-500">({t.transferReference})</span>}
                </span>
                <span className="font-semibold tabular-nums">{formatClp(t.amountClp)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
