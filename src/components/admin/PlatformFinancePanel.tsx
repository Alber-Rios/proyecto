import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Settings2, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { formatClp, getTodayIso } from '../../utils/formatters.ts';
import { downloadCsv } from '../../utils/csv.ts';
import { VerticalBarChart } from '../dashboard/DashboardCharts.tsx';
import { RefundTransfersPanel, WeeklyPayoutsPanel } from './MoneyOutPanels.tsx';
import {
  getFinanceReport,
  updatePlatformSettings,
  type FinanceReport,
  type LedgerRow,
  type PlatformSettings,
} from '../../lib/financeApi.ts';

// Ganancias de la plataforma. Todos los montos vienen de admin_finance_report()
// en la base: una fila por reserva pagada, fechada por el pago de Transbank.

type RangeKey = 'this_month' | 'last_month' | 'last_30' | 'this_year' | 'all' | 'custom';

const RANGE_LABEL: Record<RangeKey, string> = {
  this_month: 'Este mes',
  last_month: 'Mes anterior',
  last_30: 'Últimos 30 días',
  this_year: 'Este año',
  all: 'Todo',
  custom: 'Personalizado',
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeFor(key: RangeKey, today: string): { from: string; to: string } {
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  if (key === 'this_month') return { from: iso(new Date(y, m - 1, 1)), to: today };
  if (key === 'last_month') return { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m - 1, 0)) };
  if (key === 'last_30') return { from: iso(new Date(t.getTime() - 29 * 86400000)), to: today };
  if (key === 'this_year') return { from: `${y}-01-01`, to: today };
  return { from: '2025-01-01', to: today };
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
};
const pct = (rate: number) => `${Math.round(rate * 1000) / 10} %`.replace('.', ',');
const ivaOf = (gross: number) => Math.round((gross * 19) / 119);

const STATUS_LABEL: Record<string, string> = {
  pending: 'Por aprobar',
  confirmed: 'Confirmada',
  completed: 'Finalizada',
  cancelled: 'Cancelada',
  rejected: 'Rechazada',
};

const card = 'rounded-2xl border border-slate-200 bg-white';
const input = 'min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm';

export const PlatformFinancePanel: React.FC = () => {
  const today = getTodayIso();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');
  const [custom, setCustom] = useState(() => rangeFor('this_month', today));
  const range = rangeKey === 'custom' ? custom : rangeFor(rangeKey, today);
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ledgerQuery, setLedgerQuery] = useState('');
  const [ledgerStatus, setLedgerStatus] = useState('');
  const [editing, setEditing] = useState<PlatformSettings | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getFinanceReport(range.from, range.to)
      .then(setReport)
      .catch((e: Error) =>
        setError(
          /function .* does not exist|Could not find the function/i.test(e.message)
            ? 'Falta actualizar la base: ejecuta supabase/reset-and-setup.sql en Supabase.'
            : e.message
        )
      )
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  useEffect(load, [load]);

  const t = report?.totals;
  const settings: PlatformSettings | null = report?.settings
    ? {
        ownerCommissionRate: Number(report.settings.owner_commission_rate),
        ownerCommissionRateMonthly: Number(report.settings.owner_commission_rate_monthly),
        launchEndsOn: String(report.settings.launch_ends_on),
        ownerFreeBookings: Number(report.settings.owner_free_bookings),
        updatedAt: report.settings.updated_at,
      }
    : null;

  const chart = useMemo(
    () =>
      (report?.monthly || []).map((m) => ({
        key: m.month,
        label: monthLabel(m.month),
        value: m.platformRevenueClp,
        detail: `Cargo ${formatClp(m.tenantFeesClp)} · comisión ${formatClp(m.ownerCommissionsClp)} · cancelaciones ${formatClp(
          m.cancellationFeesClp
        )} · descuentos −${formatClp(m.discountsClp)}`,
      })),
    [report]
  );

  const ledger = useMemo(() => {
    const q = ledgerQuery.trim().toLowerCase();
    return (report?.rows || []).filter(
      (r) =>
        (!ledgerStatus || r.status === ledgerStatus) &&
        (!q || [r.reservation_id, r.space_title, r.tenant_name, r.owner_name].some((v) => (v || '').toLowerCase().includes(q)))
    );
  }, [report, ledgerQuery, ledgerStatus]);

  const exportLedger = () =>
    downloadCsv(`Ganancias_Spotly_${range.from}_a_${range.to}.csv`, [
      [
        'Reserva', 'Fecha de pago', 'Espacio', 'Arrendatario', 'Anfitrión', 'Estado', 'Estado de pago', 'Cobrado', 'Arriendo',
        'Garantía', 'Cargo arrendatario', 'Comisión anfitrión (%)', 'Motivo comisión', 'Comisión anfitrión', 'Descuento',
        'Retenido por cancelación', 'Ganancia Spotly', 'Para el anfitrión', 'Reembolsado', 'Por reembolsar', 'Liquidación',
      ],
      ...ledger.map((r) => [
        r.reservation_id, new Date(r.paid_at).toLocaleString('es-CL'), r.space_title, r.tenant_name, r.owner_name,
        STATUS_LABEL[r.status] || r.status, r.payment_status, r.collected_clp, r.subtotal_clp, r.deposit_clp, r.tenant_fee_clp,
        pct(r.owner_commission_rate), r.owner_commission_reason || '', r.owner_commission_clp, r.discount_clp,
        r.cancellation_fee_clp, r.platform_revenue_clp, r.owner_net_clp, r.refunded_clp, r.refund_pending_clp,
        r.payout_status || '',
      ]),
    ]);


  const handleSaveSettings = async () => {
    if (!editing) return;
    try {
      await updatePlatformSettings(editing);
      setEditing(null);
      setNotice('Comisiones actualizadas. Aplican a las reservas nuevas; las existentes mantienen su tasa.');
      load();
    } catch (e: any) {
      setNotice(e.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Período */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="sr-only">Ganancias de la plataforma</h2>
          <p className="text-sm text-slate-600">
            Del {range.from} al {range.to}, según la fecha de pago en Transbank.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs text-slate-600">Período</span>
            <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value as RangeKey)} className={input}>
              {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                <option key={k} value={k}>{RANGE_LABEL[k]}</option>
              ))}
            </select>
          </label>
          {rangeKey === 'custom' && (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-600">Desde</span>
                <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className={input} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-600">Hasta</span>
                <input type="date" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className={input} />
              </label>
            </>
          )}
          <button type="button" onClick={load} className={`${input} inline-flex items-center gap-1.5 font-semibold cursor-pointer`}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">{notice}</p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      {t && (
        <>
          {/* Resultado */}
          <div className="grid gap-4 lg:grid-cols-3">
            <section aria-labelledby="fin-result" className={`${card} p-5 lg:col-span-2`}>
              <h3 id="fin-result" className="text-sm font-semibold text-slate-600">Ganancia de Spotly en el período</h3>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{formatClp(t.platformRevenueClp)}</p>
              <p className="text-sm text-slate-600">
                {t.reservations} {t.reservations === 1 ? 'reserva pagada' : 'reservas pagadas'} · volumen arrendado {formatClp(t.gmvClp)}
                {t.gmvClp > 0 && ` · margen ${pct(t.platformRevenueClp / t.gmvClp)}`}
              </p>
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">Cómo se forma la ganancia</caption>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['Comisión Spotly que paga el arrendatario (5 % sobre el arriendo)', t.tenantFeesClp, ''],
                    ['Comisión descontada a los propietarios', t.ownerCommissionsClp, ''],
                    ['Multas por cancelar con menos de 24 h', t.cancellationFeesClp, ''],
                    ['Códigos de descuento (los paga Spotly)', t.discountsClp ? -t.discountsClp : 0, ''],
                  ].map(([label, value]) => (
                    <tr key={String(label)}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-slate-700">{label}</th>
                      <td className={`py-2 text-right tabular-nums ${Number(value) < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                        {Number(value) < 0 ? `− ${formatClp(-Number(value))}` : formatClp(Number(value))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="pt-2 pr-3 text-left font-bold text-slate-950">Lo que gana Spotly (con IVA)</th>
                    <td className="pt-2 text-right font-bold tabular-nums text-slate-950">{formatClp(t.platformRevenueClp)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-1 pr-3 text-left font-normal text-slate-600">IVA que va al SII (ya viene dentro de lo anterior)</th>
                    <td className="py-1 text-right tabular-nums text-slate-600">− {formatClp(ivaOf(t.platformRevenueClp))}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-1 pr-3 text-left font-semibold text-slate-800">Lo que le queda a Spotly</th>
                    <td className="py-1 text-right font-semibold tabular-nums text-slate-800">
                      {formatClp(t.platformRevenueClp - ivaOf(t.platformRevenueClp))}
                    </td>
                  </tr>
                </tbody>
              </table>
              {t.pendingRevenueClp > 0 && (
                <p className="mt-3 text-sm text-amber-900">
                  {formatClp(t.pendingRevenueClp)} más quedan pendientes en solicitudes pagadas que el anfitrión aún no acepta.
                </p>
              )}
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                <p>
                  <strong className="text-slate-800">¿El 19 % es sobre los arriendos? No.</strong> Spotly solo paga IVA por lo que cobra él mismo (cargo de
                  servicio y comisión). El arriendo es plata del propietario: si su espacio es amoblado o equipado, el IVA de ese arriendo lo declara el
                  propietario, no Spotly.
                </p>
                <p className="mt-1">No incluye lo que cobra Transbank por cada pago. Es una estimación para orientarte; tu contador confirma la cifra final.</p>
              </div>
            </section>

            <section aria-labelledby="fin-money" className={`${card} space-y-3 p-5`}>
              <h3 id="fin-money" className="text-sm font-semibold text-slate-600">Movimiento de dinero</h3>
              <dl className="space-y-2 text-sm">
                {[
                  ['Cobrado con Webpay', t.collectedClp],
                  ['Reembolsado', t.refundedClp],
                  ['Por reembolsar', t.refundPendingClp],
                  ['Para anfitriones (ganado)', t.ownerNetClp],
                  ['Garantías retenidas', t.depositsHeldClp],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between gap-3">
                    <dt className="text-slate-700">{label}</dt>
                    <dd className="tabular-nums font-semibold text-slate-950">{formatClp(Number(value))}</dd>
                  </div>
                ))}
              </dl>
              <div className="rounded-xl bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-950">Por transferir a anfitriones</p>
                <p className="tabular-nums text-amber-900">
                  {formatClp(report!.payouts.pendingClp)} en {report!.payouts.pendingCount}{' '}
                  {report!.payouts.pendingCount === 1 ? 'liquidación' : 'liquidaciones'}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                {t.completedCount} finalizadas · {t.cancelledCount} canceladas o rechazadas
              </p>
            </section>
          </div>

          {/* Mes a mes */}
          <section aria-labelledby="fin-chart" className={`${card} p-5`}>
            <h3 id="fin-chart" className="text-base font-bold text-slate-900">Ganancia de Spotly por mes</h3>
            <VerticalBarChart title="Ganancia por mes" data={chart} formatValue={formatClp} height={180} />
          </section>

          {/* Salida de dinero: depósitos de los martes y devoluciones por transferencia */}
          <WeeklyPayoutsPanel onChanged={load} />
          <RefundTransfersPanel onChanged={load} />

          {/* Por espacio */}
          {report!.topSpaces.length > 0 && (
            <section aria-labelledby="fin-spaces" className={`${card} p-5`}>
              <h3 id="fin-spaces" className="text-base font-bold text-slate-900">Espacios que más ganancia dejan</h3>
              <ol className="mt-2 divide-y divide-slate-100">
                {report!.topSpaces.map((s, i) => (
                  <li key={s.spaceId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="mr-2 tabular-nums text-slate-500">{i + 1}.</span>
                      <span className="font-semibold text-slate-900">{s.spaceTitle}</span>
                      <span className="text-slate-600"> · {s.ownerName} · {s.reservations} {s.reservations === 1 ? 'reserva' : 'reservas'}</span>
                    </span>
                    <span className="tabular-nums">
                      <span className="font-bold text-slate-950">{formatClp(s.platformRevenueClp)}</span>
                      <span className="text-slate-600"> Spotly · {formatClp(s.ownerNetClp)} anfitrión</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Detalle por reserva */}
          <section aria-labelledby="fin-ledger" className={`${card} overflow-hidden`}>
            <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 id="fin-ledger" className="text-base font-bold text-slate-900">Detalle por reserva</h3>
                <p className="text-sm text-slate-600">Cada reserva pagada con lo que gana cada parte. Hasta 500 filas por período.</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="relative">
                  <span className="sr-only">Buscar</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input value={ledgerQuery} onChange={(e) => setLedgerQuery(e.target.value)} placeholder="Reserva, espacio o persona" className={`${input} pl-9`} />
                </label>
                <label>
                  <span className="sr-only">Estado</span>
                  <select value={ledgerStatus} onChange={(e) => setLedgerStatus(e.target.value)} className={input}>
                    <option value="">Todos los estados</option>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={exportLedger} disabled={ledger.length === 0} className={`${input} inline-flex items-center gap-1.5 font-semibold disabled:opacity-40 cursor-pointer`}>
                  <Download className="h-4 w-4" aria-hidden="true" /> CSV
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">Pago</th>
                    <th scope="col" className="px-4 py-2 font-semibold">Reserva</th>
                    <th scope="col" className="px-4 py-2 font-semibold">Estado</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold whitespace-nowrap">Cobrado</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold whitespace-nowrap">Cargo 5 %</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold whitespace-nowrap">Comisión anfitrión</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold whitespace-nowrap">Descuento</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold whitespace-nowrap">Spotly</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold whitespace-nowrap">Anfitrión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((r: LedgerRow) => (
                    <tr key={r.reservation_id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{new Date(r.paid_at).toLocaleDateString('es-CL')}</td>
                      <td className="px-4 py-2.5">
                        <span className="block font-semibold text-slate-900">{r.space_title}</span>
                        <span className="text-xs text-slate-600">{r.tenant_name} → {r.owner_name}</span>
                        <span className="block font-mono text-xs text-slate-500">{r.reservation_id}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {STATUS_LABEL[r.status] || r.status}
                        {r.refund_pending_clp > 0 && <span className="block text-xs text-amber-800">Reembolso {formatClp(r.refund_pending_clp)} pendiente</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatClp(r.collected_clp)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatClp(r.tenant_fee_clp)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {formatClp(r.owner_commission_clp)}
                        <span className="block text-xs text-slate-500">
                          {pct(r.owner_commission_rate)}
                          {r.owner_commission_reason === 'lanzamiento' ? ' · lanzamiento' : r.owner_commission_reason === 'bienvenida' ? ' · bienvenida' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-rose-700">{r.discount_clp ? `− ${formatClp(r.discount_clp)}` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap text-slate-950">
                        {formatClp(r.platform_revenue_clp)}
                        {r.cancellation_fee_clp > 0 && <span className="block text-xs font-normal text-slate-500">retenido</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatClp(r.owner_net_clp)}</td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-slate-600">No hay reservas pagadas en este período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Comisiones vigentes */}
          {settings && (
            <section aria-labelledby="fin-settings" className={`${card} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="fin-settings" className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <Settings2 className="h-4 w-4 text-slate-600" aria-hidden="true" /> Comisiones vigentes
                  </h3>
                  <p className="text-sm text-slate-600">
                    Arrendatario 5 % · propietario {pct(settings.ownerCommissionRate)} desde su primera reserva, en todas las modalidades.
                  </p>
                </div>
                {!editing && (
                  <button type="button" onClick={() => setEditing(settings)} className={`${input} font-semibold cursor-pointer`}>
                    Cambiar
                  </button>
                )}
              </div>
              {editing && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm">
                    <span className="mb-1 block text-slate-700">Comisión propietario (%)</span>
                    <input type="number" min={0} max={30} step={0.5} value={Math.round(editing.ownerCommissionRate * 1000) / 10}
                      onChange={(e) => setEditing({ ...editing, ownerCommissionRate: Number(e.target.value) / 100 })} className={`${input} w-full`} />
                  </label>
                  <p className="text-sm text-slate-600 sm:col-span-1 lg:col-span-2">
                    El cambio queda en la auditoría y solo aplica a reservas nuevas.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(null)} className={`${input} cursor-pointer`}>Cancelar</button>
                    <button type="button" onClick={handleSaveSettings} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white cursor-pointer">
                      Guardar
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {loading && !report && <p className="text-sm text-slate-600">Cargando reporte…</p>}
    </div>
  );
};
