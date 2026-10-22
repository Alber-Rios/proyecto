import React, { useMemo } from 'react';
import { AlertTriangle, Building2, CreditCard, Percent, ShieldCheck, ShoppingBag, UserPlus, Wallet } from 'lucide-react';
import type { Dispute, Reservation, Space, UserProfile } from '../../types.ts';
import { formatClp } from '../../utils/formatters.ts';
import { ActionQueue, HorizontalBarList, StatTile, VerticalBarChart, lastMonths, pctChange } from './DashboardCharts.tsx';

type AdminTab = 'kyc' | 'spaces' | 'disputes' | 'transactions' | 'payments' | 'kpi';

interface AdminOverviewProps {
  todayIso: string;
  users: UserProfile[];
  spaces: Space[];
  reservations: Reservation[];
  disputes: Dispute[];
  onGoTab: (tab: AdminTab) => void;
}

const isEarning = (r: Reservation) => r.status === 'confirmed' || r.status === 'completed';
// Mes en que se generó la venta (fecha de creación; si falta, la de inicio).
const monthOf = (r: Reservation) => (r.createdAt || r.startDate).slice(0, 7);
const compactClp = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1).replace('.', ',')}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : formatClp(v);

const STATUS_LABEL: Record<string, string> = {
  pending: 'Por aprobar',
  confirmed: 'Confirmadas',
  completed: 'Completadas',
  cancelled: 'Canceladas',
  rejected: 'Rechazadas',
};

export const AdminOverview: React.FC<AdminOverviewProps> = ({ todayIso, users, spaces, reservations, disputes, onGoTab }) => {
  const months = useMemo(() => lastMonths(todayIso, 6), [todayIso]);
  const cur = months[months.length - 1].key;
  const prev = months[months.length - 2].key;

  const byMonth = useMemo(() => {
    const map = new Map<string, { gmv: number; fee: number; count: number; cancelled: number }>();
    for (const r of reservations) {
      const k = monthOf(r);
      const m = map.get(k) || { gmv: 0, fee: 0, count: 0, cancelled: 0 };
      m.count++;
      if (r.status === 'cancelled' || r.status === 'rejected') m.cancelled++;
      if (isEarning(r)) {
        m.gmv += r.totalClp;
        m.fee += r.platformFeeClp || 0;
      }
      map.set(k, m);
    }
    return map;
  }, [reservations]);

  const usersByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) {
      if (u.role === 'admin' || !u.createdAt) continue;
      const k = u.createdAt.slice(0, 7);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }, [users]);

  const empty = { gmv: 0, fee: 0, count: 0, cancelled: 0 };
  const now = byMonth.get(cur) || empty;
  const before = byMonth.get(prev) || empty;
  const newUsers = usersByMonth.get(cur) || 0;
  const newUsersPrev = usersByMonth.get(prev) || 0;
  const cancelRate = now.count ? Math.round((now.cancelled / now.count) * 100) : 0;

  const nonAdmin = users.filter((u) => u.role !== 'admin');
  const kycPending = nonAdmin.filter((u) => u.verificationStatus === 'pending_review' || u.verificationStatus === 'in_progress').length;
  const moderation = spaces.filter((s) => s.status === 'pending_approval').length;
  const openDisputes = disputes.filter((d) => d.status === 'pending' || d.status === 'investigating').length;
  const unpaid = reservations.filter(
    (r) => r.status === 'pending' && (r.paymentStatus === 'pending' || r.paymentStatus === 'failed') && r.startDate >= todayIso
  ).length;

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reservations) counts.set(r.status, (counts.get(r.status) || 0) + 1);
    return Object.keys(STATUS_LABEL)
      .map((k) => ({ key: k, label: STATUS_LABEL[k], value: counts.get(k) || 0 }))
      .filter((d) => d.value > 0);
  }, [reservations]);

  const topCommunes = useMemo(() => {
    const map = new Map<string, { gmv: number; count: number }>();
    const communeOf = new Map(spaces.map((s) => [s.id, s.commune]));
    for (const r of reservations) {
      if (!isEarning(r)) continue;
      const c = communeOf.get(r.spaceId) || 'Sin comuna';
      const m = map.get(c) || { gmv: 0, count: 0 };
      map.set(c, { gmv: m.gmv + r.totalClp, count: m.count + 1 });
    }
    return [...map.entries()]
      .map(([c, v]) => ({ key: c, label: c, value: v.gmv, detail: `${v.count} ${v.count === 1 ? 'reserva' : 'reservas'}` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [reservations, spaces]);

  const topSpaces = useMemo(() => {
    const map = new Map<string, { title: string; gmv: number; count: number }>();
    for (const r of reservations) {
      if (!isEarning(r)) continue;
      const m = map.get(r.spaceId) || { title: r.spaceTitle, gmv: 0, count: 0 };
      map.set(r.spaceId, { ...m, gmv: m.gmv + r.totalClp, count: m.count + 1 });
    }
    return [...map.entries()]
      .map(([id, v]) => ({ key: id, label: v.title, value: v.gmv, detail: `${v.count} ${v.count === 1 ? 'reserva' : 'reservas'}` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [reservations]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Volumen transado (mes)"
          value={formatClp(now.gmv)}
          delta={pctChange(now.gmv, before.gmv)}
          hint="vs. mes anterior"
          icon={<ShoppingBag className="w-4 h-4" />}
          onClick={() => onGoTab('transactions')}
        />
        <StatTile
          label="Comisión Spotly (mes)"
          value={formatClp(now.fee)}
          delta={pctChange(now.fee, before.fee)}
          hint="ingreso de la plataforma"
          icon={<Wallet className="w-4 h-4" />}
          onClick={() => onGoTab('payments')}
        />
        <StatTile
          label="Usuarios nuevos (mes)"
          value={String(newUsers)}
          delta={pctChange(newUsers, newUsersPrev)}
          hint={`${nonAdmin.length} en total`}
          icon={<UserPlus className="w-4 h-4" />}
          onClick={() => onGoTab('kyc')}
        />
        <StatTile
          label="Cancelación (mes)"
          value={`${cancelRate}%`}
          hint={`${now.cancelled} de ${now.count} reservas`}
          icon={<Percent className="w-4 h-4" />}
          tone={cancelRate >= 25 ? 'attention' : 'default'}
          onClick={() => onGoTab('kpi')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Volumen transado por mes</h3>
            <span className="text-[11.5px] text-slate-500">Reservas confirmadas y completadas</span>
          </div>
          <VerticalBarChart
            title="Volumen transado por mes"
            data={months.map((m) => {
              const v = byMonth.get(m.key) || empty;
              return { key: m.key, label: m.label, value: v.gmv, detail: `Comisión ${formatClp(v.fee)}` };
            })}
            formatValue={compactClp}
          />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Requiere tu atención</h3>
          <ActionQueue
            items={[
              { key: 'kyc', label: 'Verificaciones KYC', count: kycPending, hint: 'Identidades por revisar', icon: <ShieldCheck className="w-4 h-4" />, onClick: () => onGoTab('kyc'), urgent: true },
              { key: 'disputes', label: 'Disputas abiertas', count: openDisputes, hint: 'Pendientes o en investigación', icon: <AlertTriangle className="w-4 h-4" />, onClick: () => onGoTab('disputes'), urgent: true },
              { key: 'moderation', label: 'Espacios en moderación', count: moderation, hint: 'Publicaciones por aprobar', icon: <Building2 className="w-4 h-4" />, onClick: () => onGoTab('spaces') },
              { key: 'unpaid', label: 'Reservas sin pago aprobado', count: unpaid, hint: 'Pago pendiente o rechazado', icon: <CreditCard className="w-4 h-4" />, onClick: () => onGoTab('payments') },
            ]}
          />
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Usuarios nuevos por mes</h3>
            <span className="text-[11.5px] text-slate-500">Arrendatarios y propietarios</span>
          </div>
          <VerticalBarChart
            title="Usuarios nuevos por mes"
            data={months.map((m) => ({ key: m.key, label: m.label, value: usersByMonth.get(m.key) || 0 }))}
            formatValue={(v) => String(v)}
            height={120}
          />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Comunas con más volumen</h3>
          <HorizontalBarList title="Volumen por comuna" data={topCommunes} formatValue={compactClp} emptyText="Aún no hay reservas confirmadas." />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Espacios con más volumen</h3>
          <HorizontalBarList
            title="Volumen por espacio"
            data={topSpaces}
            formatValue={compactClp}
            emptyText="Aún no hay reservas confirmadas."
            onSelect={() => onGoTab('spaces')}
          />
        </section>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Reservas por estado</h3>
          <span className="text-[11.5px] text-slate-500">{reservations.length} en total</span>
        </div>
        <HorizontalBarList title="Reservas por estado" data={statusBreakdown} formatValue={(v) => String(v)} emptyText="Aún no hay reservas." />
      </section>
    </div>
  );
};
