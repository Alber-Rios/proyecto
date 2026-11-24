import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Building2, CalendarX, ChevronLeft, ExternalLink, FileText, Flag, Search, Star, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { Sensitive } from '../Sensitive.tsx';
import { getReportsFromDb, getReviewsByTenant, getReviewsForSpaces } from '../../lib/dataAccess.ts';
import {
  SII_THIRD_PARTY_URL,
  getTaxCertificateUrl,
  getTaxStatus,
  taxPending,
  taxStatusOk,
  taxValidUntil,
  type TaxStatus,
} from '../../lib/financeApi.ts';
import type { Review, UserProfile, UserReport } from '../../types.ts';

const ROLE: Record<string, string> = { tenant: 'Arrendatario', owner: 'Propietario', admin: 'Administración' };
const KYC: Record<string, [string, string]> = {
  verified: ['Identidad verificada', 'bg-emerald-50 text-emerald-700'],
  pending_review: ['Verificación en revisión', 'bg-amber-50 text-amber-800'],
  in_progress: ['Verificación a medias', 'bg-slate-100 text-slate-700'],
  rejected: ['Verificación rechazada', 'bg-rose-50 text-rose-700'],
  unverified: ['Sin verificar', 'bg-slate-100 text-slate-700'],
};
const SPACE_STATUS: Record<string, [string, string]> = {
  active: ['Activo', 'bg-emerald-50 text-emerald-700'],
  pending_approval: ['Por aprobar', 'bg-amber-50 text-amber-800'],
  paused: ['Pausado', 'bg-slate-100 text-slate-600'],
  deleted: ['Eliminado', 'bg-slate-100 text-slate-500'],
};

const digits = (s: string) => s.replace(/[^0-9kK]/g, '').toLowerCase();
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const Stars: React.FC<{ value: number }> = ({ value }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} de 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
    ))}
  </span>
);

const Card: React.FC<{ title: string; icon: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, aside, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {icon}
        {title}
      </h3>
      {aside}
    </div>
    {children}
  </section>
);

const Row: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <span className="shrink-0 text-slate-500">{k}</span>
    <span className="min-w-0 text-right font-medium text-slate-900">{children}</span>
  </div>
);

/**
 * Ficha de usuario para administración: búsqueda por nombre, RUT o correo y, al elegir,
 * sus datos (enmascarados), situación tributaria, espacios, cancelaciones con motivo,
 * calificación y reportes recibidos.
 */
export const AdminUserLookup: React.FC = () => {
  const { allUsers, spaces, reservations } = useApp();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return allUsers.slice(0, 30);
    const qd = digits(q);
    const qf = fold(q);
    return allUsers
      .filter((u) => fold(u.fullName || '').includes(qf) || (qd.length >= 3 && digits(u.rut || '').includes(qd)) || fold(u.email || '').includes(qf))
      .slice(0, 50);
  }, [allUsers, query]);

  const user = selectedId ? allUsers.find((u) => u.id === selectedId) ?? null : null;

  const pick = (u: UserProfile) => {
    setSelectedId(u.id);
    // En el celular la ficha queda debajo de la lista: se lleva a la vista.
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white lg:col-span-4 ${user ? 'hidden lg:block' : ''}`}>
        <div className="border-b border-slate-100 p-4">
          <label htmlFor="user-lookup" className="text-xs font-bold text-slate-700">
            Buscar usuario
          </label>
          <div className="relative mt-1.5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="user-lookup"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, RUT o correo"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {query.trim() ? `${results.length} resultado${results.length === 1 ? '' : 's'}` : `${allUsers.length} usuarios · escribe para filtrar`}
          </p>
        </div>
        <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
          {results.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No hay usuarios con ese nombre o RUT.</li>}
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => pick(u)}
                aria-current={u.id === selectedId}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 cursor-pointer ${u.id === selectedId ? 'bg-indigo-50' : ''}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                  {(u.fullName || '?').charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{u.fullName}</span>
                  <span className="block text-xs text-slate-500">
                    {ROLE[u.role] || u.role} · <Sensitive kind="rut" value={u.rut} noReveal />
                  </span>
                </span>
                {u.isSuspended && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">Suspendida</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div ref={detailRef} className="scroll-mt-4 lg:col-span-8">
        {user ? (
          <UserDetail key={user.id} user={user} spaces={spaces} reservations={reservations} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="hidden rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 lg:block">
            Elige un usuario de la lista para ver su ficha.
          </div>
        )}
      </div>
    </div>
  );
};

const UserDetail: React.FC<{
  user: UserProfile;
  spaces: ReturnType<typeof useApp>['spaces'];
  reservations: ReturnType<typeof useApp>['reservations'];
  onBack: () => void;
}> = ({ user, spaces, reservations, onBack }) => {
  const [tax, setTax] = useState<TaxStatus | null | undefined>(undefined);
  const [received, setReceived] = useState<Review[]>([]);
  const [given, setGiven] = useState<Review[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);

  const mySpaces = useMemo(() => spaces.filter((s) => s.ownerId === user.id), [spaces, user.id]);
  const asTenant = useMemo(() => reservations.filter((r) => r.tenantId === user.id), [reservations, user.id]);
  const asOwner = useMemo(() => reservations.filter((r) => r.ownerId === user.id), [reservations, user.id]);
  // Cancelaciones hechas por esta persona (como arrendatario o como propietario).
  const cancellations = useMemo(
    () =>
      reservations
        .filter((r) => r.status === 'cancelled' && r.cancelledBy === user.id)
        .sort((a, b) => (b.cancelledAt || '').localeCompare(a.cancelledAt || '')),
    [reservations, user.id]
  );

  useEffect(() => {
    let alive = true;
    getTaxStatus(user.id).then((t) => alive && setTax(t));
    getReviewsByTenant(user.id).then((r) => alive && setGiven(r));
    getReportsFromDb()
      .then((all) => alive && setReports(all.filter((r) => r.targetUserId === user.id || mySpaces.some((s) => s.id === r.targetSpaceId))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user.id]);
  useEffect(() => {
    let alive = true;
    getReviewsForSpaces(mySpaces.map((s) => s.id)).then((r) => alive && setReceived(r));
    return () => {
      alive = false;
    };
  }, [mySpaces.map((s) => s.id).join(',')]);

  const avgReceived = received.length ? received.reduce((a, r) => a + r.rating, 0) / received.length : 0;
  const avgGiven = given.length ? given.reduce((a, r) => a + r.rating, 0) / given.length : 0;
  const totalBookings = asTenant.length + asOwner.length;
  const kyc = KYC[user.verificationStatus] || KYC.unverified;

  const openCertificate = async () => {
    if (!tax?.certificatePath) return;
    const url = await getTaxCertificateUrl(tax.certificatePath);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const taxLabel: [string, string] =
    tax === undefined
      ? ['Cargando…', 'bg-slate-100 text-slate-600']
      : !tax
        ? ['Sin carpeta tributaria', 'bg-slate-100 text-slate-600']
        : taxPending(tax)
          ? ['Carpeta por revisar', 'bg-sky-50 text-sky-700']
          : tax.reviewStatus === 'rejected'
            ? ['Carpeta rechazada', 'bg-rose-50 text-rose-700']
            : taxStatusOk(tax)
              ? ['Al día', 'bg-emerald-50 text-emerald-700']
              : tax.hasActivity
                ? ['Incumplimiento o vencida', 'bg-amber-50 text-amber-800']
                : tax.exemptDeclared
                  ? ['Declaró no obligado', 'bg-slate-100 text-slate-700']
                  : ['Sin inicio de actividades', 'bg-rose-50 text-rose-700'];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 lg:hidden cursor-pointer">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Volver a la búsqueda
      </button>

      {/* Encabezado */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-950">{user.fullName}</h2>
            <p className="text-sm text-slate-600">
              {ROLE[user.role] || user.role} · desde {fmtDate(user.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${kyc[1]}`}>{kyc[0]}</span>
            {user.isSuspended && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">Cuenta suspendida</span>}
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Reservas', totalBookings],
            ['Cancelaciones', cancellations.length],
            ['Espacios', mySpaces.filter((s) => s.status !== 'deleted').length],
            ['Reportes', reports.length],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="text-lg font-bold tabular-nums text-slate-950">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Datos personales (enmascarados) */}
        <Card title="Datos personales" icon={<UserRound className="h-4 w-4 text-slate-500" aria-hidden="true" />}>
          <div className="divide-y divide-slate-100">
            <Row k="RUT">
              <Sensitive kind="rut" value={user.rut} />
            </Row>
            <Row k="Correo">
              <Sensitive kind="email" value={user.email} />
            </Row>
            <Row k="Teléfono">{user.phone ? <Sensitive kind="phone" value={user.phone} /> : '—'}</Row>
            <Row k="Comuna">{[user.commune, user.city].filter(Boolean).join(', ') || '—'}</Row>
            {user.isSuspended && <Row k="Motivo suspensión">{user.suspendedReason || '—'}</Row>}
          </div>
          <p className="mt-2 text-xs text-slate-500">Los datos se muestran ocultos; el ojo los muestra 15 segundos.</p>
        </Card>

        {/* Situación tributaria */}
        <Card
          title="Situación tributaria"
          icon={<FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />}
          aside={<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${taxLabel[1]}`}>{taxLabel[0]}</span>}
        >
          {tax ? (
            <div className="divide-y divide-slate-100">
              <Row k="Inicio de actividades">{tax.hasActivity ? `Sí · giro ${tax.activityCode || '—'}` : 'No'}</Row>
              <Row k="Cumplimiento">{tax.hasActivity ? (tax.upToDate ? 'Al día' : 'Con incumplimientos') : '—'}</Row>
              <Row k="Carpeta subida">{fmtDate(tax.certificateUploadedAt || undefined)}</Row>
              <Row k="Vale hasta">{tax.certificateUploadedAt || tax.reviewedAt ? fmtDate(taxValidUntil(tax).toISOString()) : '—'}</Row>
              {tax.reviewStatus === 'rejected' && <Row k="Motivo rechazo">{tax.reviewNote || '—'}</Row>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{tax === undefined ? 'Cargando…' : 'No ha subido su carpeta tributaria.'}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {tax?.certificatePath && (
              <button type="button" onClick={openCertificate} className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline cursor-pointer">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Ver carpeta
              </button>
            )}
            <a href={SII_THIRD_PARTY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline">
              Contrastar en el SII <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </Card>
      </div>

      {/* Calificación */}
      <Card title="Calificación" icon={<Star className="h-4 w-4 text-slate-500" aria-hidden="true" />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Como propietario (reseñas de sus espacios)</p>
            {received.length ? (
              <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-900">
                {avgReceived.toFixed(1)} <Stars value={avgReceived} /> <span className="font-normal text-slate-500">({received.length})</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">Sin reseñas</p>
            )}
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Como arrendatario (reseñas que dejó)</p>
            {given.length ? (
              <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-900">
                {avgGiven.toFixed(1)} <Stars value={avgGiven} /> <span className="font-normal text-slate-500">({given.length})</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">No ha dejado reseñas</p>
            )}
          </div>
        </div>
        {received.length > 0 && (
          <ul className="mt-3 space-y-2">
            {received.slice(0, 3).map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-100 p-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <Stars value={r.rating} /> <span className="text-xs text-slate-500">{r.tenantName} · {fmtDate(r.createdAt)}</span>
                </span>
                {r.comment && <span className="mt-1 block text-slate-700">«{r.comment}»</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Cancelaciones */}
      <Card
        title="Cancelaciones"
        icon={<CalendarX className="h-4 w-4 text-slate-500" aria-hidden="true" />}
        aside={
          totalBookings > 0 ? (
            <span className="text-xs text-slate-500">
              {cancellations.length} de {totalBookings} reservas ({Math.round((cancellations.length / totalBookings) * 100)} %)
            </span>
          ) : undefined
        }
      >
        {cancellations.length === 0 ? (
          <p className="text-sm text-slate-500">No ha cancelado reservas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {cancellations.map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900">{r.spaceTitle}</span>
                  <span className="text-xs text-slate-500">
                    {r.tenantId === user.id ? 'Como arrendatario' : 'Como propietario'} · {fmtDate(r.cancelledAt)}
                  </span>
                </span>
                <span className="block text-xs text-slate-500">Reserva del {r.startDate}{r.timeSlotString ? ` · ${r.timeSlotString}` : ''}</span>
                <span className="mt-0.5 block text-slate-700">Motivo: {r.cancellationReason || 'sin motivo indicado'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Espacios */}
      <Card title="Espacios publicados" icon={<Building2 className="h-4 w-4 text-slate-500" aria-hidden="true" />}>
        {mySpaces.length === 0 ? (
          <p className="text-sm text-slate-500">No tiene espacios.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {mySpaces.map((s) => {
              const st = SPACE_STATUS[s.status] || SPACE_STATUS.paused;
              const n = asOwner.filter((r) => r.spaceId === s.id && (r.status === 'confirmed' || r.status === 'completed')).length;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">{s.title}</span>
                    <span className="text-xs text-slate-500">
                      {s.commune} · {n} {n === 1 ? 'reserva' : 'reservas'}
                      {s.isFurnished ? ' · amoblado' : ''}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${st[1]}`}>{st[0]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Reportes */}
      {reports.length > 0 && (
        <Card title="Reportes recibidos" icon={<Flag className="h-4 w-4 text-slate-500" aria-hidden="true" />}>
          <ul className="divide-y divide-slate-100">
            {reports.map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900">{r.category}</span>
                  <span className="text-xs text-slate-500">{fmtDate(r.createdAt)} · {({ open: 'Abierto', reviewing: 'En revisión', resolved: 'Resuelto', dismissed: 'Descartado' } as Record<string, string>)[r.status] || r.status}</span>
                </span>
                <span className="block text-slate-700">{r.description}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {user.isSuspended && (
        <p className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <Ban className="h-4 w-4" aria-hidden="true" /> Esta cuenta está suspendida. Puedes reactivarla en Reportes y cuentas.
        </p>
      )}
    </div>
  );
};
