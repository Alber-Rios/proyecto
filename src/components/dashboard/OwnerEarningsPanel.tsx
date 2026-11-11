import React, { useEffect, useMemo, useState } from 'react';
import { Download, Info, Percent, Wallet, ArrowDownToLine, Clock } from 'lucide-react';
import type { Reservation, Space, UserProfile } from '../../types.ts';
import { formatClp, formatRut, getTodayIso } from '../../utils/formatters.ts';
import { commissionLabel, reservationLedger } from '../../utils/ledger.ts';
import {
  DEFAULT_PLATFORM_SETTINGS,
  getMyPayouts,
  getPlatformSettings,
  type OwnerPayout,
  type PlatformSettings,
} from '../../lib/financeApi.ts';
import { formatLongDate } from '../../utils/contractTerm.ts';
import { OwnerRevenueReport } from '../OwnerRevenueReport.tsx';

interface Props {
  reservations: Reservation[];
  spaces: Space[];
  currentUser: UserProfile;
}

const pct = (rate: number) => `${Math.round(rate * 1000) / 10} %`.replace('.', ',');

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

type PayState = { label: string; tone: 'slate' | 'amber' | 'emerald' | 'rose'; detail?: string };

function payoutState(r: Reservation, payout?: OwnerPayout): PayState {
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
  if (payout?.status === 'pending') return { label: 'Por transferir', tone: 'amber' };
  if (r.status === 'confirmed') return { label: 'En curso', tone: 'slate', detail: 'Se liquida al terminar' };
  return { label: 'Por liquidar', tone: 'amber' };
}

const toneClass: Record<PayState['tone'], string> = {
  slate: 'bg-slate-100 text-slate-800',
  amber: 'bg-amber-100 text-amber-900',
  emerald: 'bg-emerald-100 text-emerald-900',
  rose: 'bg-rose-100 text-rose-900',
};

// Ganancias del anfitrión: lo que recibe, lo transferido, lo pendiente y la
// comisión de Spotly, con el detalle de cada reserva.
export const OwnerEarningsPanel: React.FC<Props> = ({ reservations, spaces, currentUser }) => {
  const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const todayIso = getTodayIso();

  useEffect(() => {
    let alive = true;
    getMyPayouts().then((p) => alive && setPayouts(p));
    getPlatformSettings().then((s) => alive && setSettings(s));
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

  const completedCount = reservations.filter((r) => r.status === 'confirmed' || r.status === 'completed').length;
  const inLaunch = todayIso <= settings.launchEndsOn;
  const freeLeft = Math.max(settings.ownerFreeBookings - completedCount, 0);

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
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
          inLaunch || freeLeft > 0 ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
        }`}
      >
        <Percent className={`mt-0.5 h-5 w-5 shrink-0 ${inLaunch || freeLeft > 0 ? 'text-emerald-700' : 'text-slate-600'}`} aria-hidden="true" />
        <div className="min-w-0 text-sm">
          {inLaunch ? (
            <>
              <p className="font-semibold text-emerald-950">Hoy no pagas comisión: recibes el 100 % de cada arriendo</p>
              <p className="text-emerald-900">
                Es así hasta el {formatLongDate(settings.launchEndsOn, false)}. Desde el día siguiente, Spotly se queda con el{' '}
                {pct(settings.ownerCommissionRate)} de cada arriendo ({pct(settings.ownerCommissionRateMonthly)} si es mensual). Por
                ejemplo, en un arriendo de {formatClp(40000)} recibirías {formatClp(Math.round(40000 * (1 - settings.ownerCommissionRate)))}.
              </p>
            </>
          ) : freeLeft > 0 ? (
            <>
              <p className="font-semibold text-emerald-950">
                {freeLeft === 1 ? 'Tu próxima reserva va sin comisión' : `Tus próximas ${freeLeft} reservas van sin comisión`}
              </p>
              <p className="text-emerald-900">
                Es la bienvenida para anfitriones nuevos: recibes el arriendo completo. Después, Spotly se queda con el{' '}
                {pct(settings.ownerCommissionRate)} de cada arriendo ({pct(settings.ownerCommissionRateMonthly)} si es mensual).
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-950">
                Comisión de Spotly: {pct(settings.ownerCommissionRate)} ({pct(settings.ownerCommissionRateMonthly)} en arriendos mensuales)
              </p>
              <p className="text-slate-700">
                Por ejemplo, en un arriendo de {formatClp(40000)} recibes {formatClp(Math.round(40000 * (1 - settings.ownerCommissionRate)))}. La
                comisión queda fija al momento de cada reserva.
              </p>
            </>
          )}
        </div>
      </div>

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
        Por cada reserva recibes el arriendo menos la comisión de Spotly. El cargo de servicio del 5 % lo paga el arrendatario y los
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
          <div className="overflow-x-auto">
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

        {/* IVA */}
        <section aria-labelledby="owner-tax" className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5">
          <h3 id="owner-tax" className="text-base font-bold text-slate-900">Impuestos</h3>
          <p className="text-sm leading-relaxed text-slate-700">
            {furnishedCount > 0
              ? `Marcaste ${furnishedCount === 1 ? '1 espacio' : `${furnishedCount} espacios`} como amoblado o equipado. `
              : ''}
            El arriendo de un espacio amoblado o equipado puede estar afecto a IVA (19 %). Si corresponde, tu precio debe incluirlo y tú lo
            declaras y emites la boleta o factura al arrendatario.
          </p>
          <p className="text-sm text-slate-700">Spotly emite boleta solo por su comisión.</p>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <span className="block font-semibold text-slate-900">Tus datos de emisión</span>
            {currentUser.fullName} · RUT {formatRut(currentUser.rut)}
          </div>
          <p className="text-xs text-slate-500">Consulta con tu contador o en el SII si tu arriendo está afecto.</p>
        </section>
      </div>
    </div>
  );
};
