import React, { useEffect, useMemo, useState } from 'react';
import { Sensitive } from '../Sensitive.tsx';
import { OwnerPriceBreakdown } from '../PriceBreakdown.tsx';
import { Download, Info, Percent, Wallet, ArrowDownToLine, Clock, CalendarClock } from 'lucide-react';
import type { Reservation, Space, UserProfile } from '../../types.ts';
import { formatClp, formatRut, getTodayIso } from '../../utils/formatters.ts';
import { commissionLabel, reservationLedger } from '../../utils/ledger.ts';
import {
  DEFAULT_PLATFORM_SETTINGS,
  getMyPayouts,
  getMyBankAccount,
  nextTuesdayIso,
  getPlatformSettings,
  getTaxStatus,
  type OwnerPayout,
  type TaxStatus,
  type PlatformSettings,
} from '../../lib/financeApi.ts';
import { OwnerRevenueReport } from '../OwnerRevenueReport.tsx';
import { TaxStatusCheck } from '../TaxStatusCheck.tsx';

interface Props {
  reservations: Reservation[];
  spaces: Space[];
  currentUser: UserProfile;
  /** Abre Billetera para registrar la cuenta de depósito. */
  onGoWallet?: () => void;
}

const pct = (rate: number) => `${Math.round(rate * 1000) / 10} %`.replace('.', ',');

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

type PayState = { label: string; tone: 'slate' | 'amber' | 'emerald' | 'rose'; detail?: string };

function payoutState(r: Reservation, payout?: OwnerPayout): PayState {
  const st = basePayoutState(r, payout);
  if (payout?.ivaWithheldClp) {
    const note = `Anticipo IVA retenido ${formatClp(payout.ivaWithheldClp)}`;
    return { ...st, detail: st.detail ? `${st.detail} · ${note}` : note };
  }
  return st;
}

function basePayoutState(r: Reservation, payout?: OwnerPayout): PayState {
  if (payout?.status === 'paid') {
    return {
      label: 'Transferido',
      tone: 'emerald',
      detail: [payout.paidAt ? new Date(payout.paidAt).toLocaleDateString('es-CL') : null, payout.transferReference]
        .filter(Boolean)
        .join(' · '),
    };
  }
  if (payout?.status === 'on_hold') return { label: 'Retenido por reclamo', tone: 'rose' };
  if (payout?.status === 'pending')
    return {
      label: 'Retenido',
      tone: 'amber',
      detail: payout.scheduledFor ? `Se deposita el ${tuesdayLabel(payout.scheduledFor)}` : undefined,
    };
  if (r.status === 'confirmed') return { label: 'En curso', tone: 'slate', detail: 'Se liquida al terminar' };
  return { label: 'Por liquidar', tone: 'amber' };
}

const tuesdayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

const toneClass: Record<PayState['tone'], string> = {
  slate: 'bg-slate-100 text-slate-800',
  amber: 'bg-amber-100 text-amber-900',
  emerald: 'bg-emerald-100 text-emerald-900',
  rose: 'bg-rose-100 text-rose-900',
};

// Ganancias del anfitrión: lo que recibe, lo transferido, lo pendiente y la
// comisión de Spotly, con el detalle de cada reserva.
export const OwnerEarningsPanel: React.FC<Props> = ({ reservations, spaces, currentUser, onGoWallet }) => {
  const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [hasBank, setHasBank] = useState<boolean | null>(null);
  const [tax, setTax] = useState<TaxStatus | null>(null);
  const [taxLoading, setTaxLoading] = useState(true);
  const todayIso = getTodayIso();

  useEffect(() => {
    let alive = true;
    getMyPayouts().then((p) => alive && setPayouts(p));
    getMyBankAccount(currentUser.id).then((b) => alive && setHasBank(Boolean(b)));
    getPlatformSettings().then((s) => alive && setSettings(s));
    getTaxStatus(currentUser.id).then((t) => {
      if (!alive) return;
      setTax(t);
      setTaxLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [reservations.length]);

  const payoutByReservation = useMemo(() => new Map(payouts.map((p) => [p.reservationId, p])), [payouts]);

  const earning = useMemo(
    () =>
      reservations
        .filter((r) => (r.status === 'confirmed' || r.status === 'completed') && reservationLedger(r).ownerGrossClp > 0)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [reservations]
  );

  const totals = useMemo(() => {
    let gross = 0;
    let commission = 0;
    let net = 0;
    let inProgress = 0;
    for (const r of earning) {
      const l = reservationLedger(r);
      gross += l.ownerGrossClp;
      commission += l.ownerCommissionClp;
      net += l.ownerNetClp;
      if (!payoutByReservation.has(r.id)) inProgress += l.ownerNetClp;
    }
    const paid = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountClp, 0);
    const pending = payouts.filter((p) => p.status === 'pending' || p.status === 'on_hold').reduce((s, p) => s + p.amountClp, 0);
    return { gross, commission, net, paid, pending, inProgress };
  }, [earning, payouts, payoutByReservation]);


  const bySpace = useMemo(() => {
    const map = new Map<string, { title: string; commune: string; count: number; gross: number; commission: number; net: number }>();
    for (const sp of spaces) map.set(sp.id, { title: sp.title, commune: sp.commune, count: 0, gross: 0, commission: 0, net: 0 });
    for (const r of earning) {
      const l = reservationLedger(r);
      const m = map.get(r.spaceId) || { title: r.spaceTitle, commune: '', count: 0, gross: 0, commission: 0, net: 0 };
      m.count += 1;
      m.gross += l.ownerGrossClp;
      m.commission += l.ownerCommissionClp;
      m.net += l.ownerNetClp;
      map.set(r.spaceId, m);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.net - a.net);
  }, [earning, spaces]);

  const furnishedCount = spaces.filter((s) => s.isFurnished).length;
  const withheldTotal = payouts.reduce((sum, p) => sum + (p.ivaWithheldClp || 0), 0);

  const exportCsv = () => {
    const header = ['Reserva', 'Fecha', 'Espacio', 'Arrendatario', 'Arriendo (CLP)', 'Comisión', 'Comisión (CLP)', 'Para ti (CLP)', 'Estado del pago', 'Referencia'];
    const lines = earning.map((r) => {
      const l = reservationLedger(r);
      const p = payoutByReservation.get(r.id);
      const st = payoutState(r, p);
      return [r.id, r.startDate, r.spaceTitle, r.tenantName, l.ownerGrossClp, commissionLabel(r), l.ownerCommissionClp, l.ownerNetClp, st.label, p?.transferReference || '']
        .map(csvCell)
        .join(';');
    });
    const blob = new Blob([`﻿${[header.join(';'), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mis_ganancias_Spotly_${todayIso}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Comisión vigente */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
      >
        <Percent className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          {(
            <>
              <p className="font-semibold text-slate-950">
                Comisión de Spotly: {pct(settings.ownerCommissionRate)}
              </p>
              <p className="text-slate-700">
                La comisión lleva IVA y se descuenta del arriendo. Queda fija al momento de cada reserva. Ejemplo:
              </p>
              <div className="mt-2 max-w-sm rounded-xl bg-slate-50 px-3 py-2">
                <OwnerPriceBreakdown rentNetClp={40000} commissionRate={settings.ownerCommissionRate} compact />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Próximo depósito (cada martes) */}
      {(() => {
        const next = nextTuesdayIso(todayIso);
        const due = payouts.filter((p) => p.status === 'pending' && (p.scheduledFor || next) <= next);
        const later = payouts.filter((p) => p.status === 'pending' && p.scheduledFor && p.scheduledFor > next);
        const dueTotal = due.reduce((n, p) => n + p.amountClp, 0);
        return (
          <section
            aria-labelledby="owner-next-deposit"
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                <CalendarClock className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 id="owner-next-deposit" className="text-sm font-semibold text-slate-600">
                  Próximo depósito · {tuesdayLabel(next)}
                </h3>
                <p className="text-2xl font-bold tabular-nums text-slate-950">{formatClp(dueTotal)}</p>
                <p className="text-xs text-slate-600">
                  {due.length === 0
                    ? 'Aún no tienes arriendos terminados para este martes.'
                    : `${due.length} ${due.length === 1 ? 'arriendo terminado' : 'arriendos terminados'}.`}
                  {later.length > 0 && ` Luego, ${formatClp(later.reduce((n, p) => n + p.amountClp, 0))} el martes siguiente.`} Cada martes
                  depositamos lo de los arriendos terminados hasta el lunes.
                </p>
              </div>
            </div>
            {hasBank === false && (
              <div className="flex flex-col items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 sm:max-w-xs">
                <span className="font-semibold">Registra tu cuenta bancaria para recibir el depósito.</span>
                {onGoWallet && (
                  <button
                    type="button"
                    onClick={onGoWallet}
                    className="min-h-10 rounded-lg bg-amber-900 px-3 text-sm font-semibold text-white transition hover:bg-amber-800 active:scale-[0.97] cursor-pointer"
                  >
                    Agregar cuenta
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })()}

      {/* Resumen */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: <Wallet className="h-4 w-4" />, label: 'Ganancia neta', value: totals.net, hint: `${earning.length} ${earning.length === 1 ? 'reserva' : 'reservas'}` },
          { icon: <ArrowDownToLine className="h-4 w-4" />, label: 'Ya transferido', value: totals.paid, hint: 'A tu cuenta' },
          { icon: <Clock className="h-4 w-4" />, label: 'Por recibir', value: totals.pending + totals.inProgress, hint: 'Liquidaciones y arriendos en curso' },
          { icon: <Percent className="h-4 w-4" />, label: 'Comisión Spotly', value: totals.commission, hint: totals.gross ? `${pct(totals.commission / totals.gross)} de lo arrendado` : 'Sin reservas aún' },
        ].map((t) => (
          <div key={t.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
            <dt className="flex items-center gap-1.5 text-sm text-slate-600">
              <span aria-hidden="true" className="text-slate-500">{t.icon}</span>
              {t.label}
            </dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-slate-950 sm:text-2xl">{formatClp(t.value)}</dd>
            <dd className="text-xs text-slate-600">{t.hint}</dd>
          </div>
        ))}
      </dl>

      <p className="flex items-start gap-2 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        Por cada reserva recibes el arriendo menos la comisión de Spotly. La comisión Spotly del 5 % (con IVA) lo paga el arrendatario y los
        descuentos los absorbe Spotly: ninguno se te resta.
      </p>

      <OwnerRevenueReport reservations={reservations} />

      {/* Detalle por reserva */}
      <section aria-labelledby="owner-movements" className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h3 id="owner-movements" className="text-base font-bold text-slate-900">Detalle por reserva</h3>
            <p className="text-sm text-slate-600">Cuánto te deja cada arriendo y si ya te lo transferimos.</p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={earning.length === 0}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Descargar CSV
          </button>
        </div>
        {earning.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-600">Cuando tengas reservas confirmadas, aquí verás cuánto te deja cada una.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-2 font-semibold">Fecha</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Espacio y arrendatario</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Arriendo</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Comisión</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Para ti</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {earning.map((r) => {
                  const l = reservationLedger(r);
                  const st = payoutState(r, payoutByReservation.get(r.id));
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{r.startDate}</td>
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-slate-900">{r.spaceTitle}</span>
                        <span className="text-slate-600">{r.tenantName}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatClp(l.ownerGrossClp)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {l.ownerCommissionClp ? `− ${formatClp(l.ownerCommissionClp)}` : formatClp(0)}
                        <span className="block text-xs text-slate-500">{commissionLabel(r)}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{formatClp(l.ownerNetClp)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${toneClass[st.tone]}`}>{st.label}</span>
                        {st.detail && <span className="mt-0.5 block text-xs text-slate-500">{st.detail}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Por espacio */}
        <section aria-labelledby="owner-by-space" className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h3 id="owner-by-space" className="text-base font-bold text-slate-900">Por espacio</h3>
          {bySpace.length === 0 ? (
            <p className="text-sm text-slate-600">Aún no tienes espacios publicados.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bySpace.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{s.title}</p>
                    <p className="text-sm text-slate-600">
                      {s.count} {s.count === 1 ? 'reserva' : 'reservas'} · arriendo {formatClp(s.gross)} · comisión {formatClp(s.commission)}
                    </p>
                  </div>
                  <p className="text-right">
                    <span className="block text-xs text-slate-500">Para ti</span>
                    <span className="font-bold tabular-nums text-slate-950">{formatClp(s.net)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Impuestos (Ley 21.713) */}
        <section aria-labelledby="owner-tax" className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5">
          <h3 id="owner-tax" className="text-base font-bold text-slate-900">Impuestos</h3>
          <TaxStatusCheck status={tax} loading={taxLoading} furnished={furnishedCount > 0} onChange={setTax} />
          <ul className="space-y-1.5 text-sm leading-relaxed text-slate-700">
            <li>
              {furnishedCount > 0
                ? `Tienes ${furnishedCount === 1 ? '1 espacio amoblado' : `${furnishedCount} espacios amoblados`}: al arriendo se le suma 19 % de IVA, se te deposita junto con el arriendo y tú lo declaras.`
                : 'Tus espacios sin amoblar están exentos de IVA.'}
            </li>
            <li>Spotly emite boleta solo por su comisión (10 % + IVA).</li>
            <li>
              Por ley, Spotly revisa tu situación en el SII cada enero y julio. Si no acreditas cumplimiento, de tus arriendos amoblados se retiene un
              anticipo de IVA (hasta 19 % del neto) que puedes descontar en tu declaración.
            </li>
          </ul>
          {withheldTotal > 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Anticipo de IVA retenido hasta hoy: <strong className="tabular-nums">{formatClp(withheldTotal)}</strong>. Lo puedes imputar en tu
              declaración mensual de IVA (F29).
            </p>
          )}
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <span className="block font-semibold text-slate-900">Tus datos de emisión</span>
            {currentUser.fullName} · RUT <Sensitive kind="rut" value={currentUser.rut} />
          </div>
        </section>
      </div>
    </div>
  );
};
