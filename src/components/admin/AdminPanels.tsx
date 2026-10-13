import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { AuditLog, DiscountCode, KpiSnapshot, PaymentRecord, UserReport } from '../../types.ts';
import { getAuditLogsFromDb } from '../../lib/supabase.ts';
import {
  getDiscountCodesFromDb,
  getKpisFromDb,
  getPaymentsFromDb,
  getReportsFromDb,
  updateReportInDb,
  upsertDiscountCodeInDb,
} from '../../lib/dataAccess.ts';
import { formatClp } from '../../utils/formatters.ts';
import { evaluateKpis, KpiLight } from '../../utils/kpi.ts';
import { Download, Loader2, RefreshCw } from 'lucide-react';

const cardClass = 'bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden';
const inputClass = 'px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white';

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((c) => (/[";\n\r]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(';'))
    .join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
// Auditoría (RF-33, RNF-14, CP-19): solo lectura; la tabla es de solo adición.
// ---------------------------------------------------------------------------
export const AuditLogPanel: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<'all' | AuditLog['severity']>('all');

  const load = () => {
    setLoading(true);
    getAuditLogsFromDb()
      .then(setLogs)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(
      (l) =>
        (severity === 'all' || l.severity === severity) &&
        (!q ||
          l.action.toLowerCase().includes(q) ||
          l.userEmail.toLowerCase().includes(q) ||
          JSON.stringify(l.details).toLowerCase().includes(q))
    );
  }, [logs, search, severity]);

  return (
    <div className={cardClass}>
      <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Registro de auditoría</h2>
          <p className="text-xs text-slate-500">
            Eventos críticos con usuario, acción, entidad, IP y fecha. La bitácora es de solo adición: no admite edición ni borrado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar acción, correo o dato" className={inputClass} />
          <select value={severity} onChange={(e) => setSeverity(e.target.value as any)} className={inputClass}>
            <option value="all">Todas</option>
            <option value="info">Info</option>
            <option value="warning">Advertencia</option>
            <option value="security">Seguridad</option>
            <option value="critical">Crítico</option>
          </select>
          <button onClick={load} className={`${inputClass} flex items-center gap-1 cursor-pointer`}>
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          <button
            onClick={() =>
              downloadCsv('Auditoria_Spotly.csv', [
                ['Fecha', 'Acción', 'Severidad', 'Usuario', 'Rol', 'IP', 'Detalle'],
                ...filtered.map((l) => [l.timestamp, l.action, l.severity, l.userEmail, l.userRole, l.ip, JSON.stringify(l.details)]),
              ])
            }
            className={`${inputClass} flex items-center gap-1 cursor-pointer`}
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[70vh]">
        {loading ? (
          <p className="p-5 text-xs text-slate-500">Cargando…</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 text-left sticky top-0">
              <tr>
                <th className="px-4 py-2 font-semibold">Fecha</th>
                <th className="px-4 py-2 font-semibold">Acción</th>
                <th className="px-4 py-2 font-semibold">Usuario</th>
                <th className="px-4 py-2 font-semibold">IP</th>
                <th className="px-4 py-2 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{new Date(log.timestamp).toLocaleString('es-CL')}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        log.severity === 'critical'
                          ? 'bg-rose-100 text-rose-800'
                          : log.severity === 'security'
                          ? 'bg-indigo-100 text-indigo-800'
                          : log.severity === 'warning'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {log.userEmail}
                    <span className="block text-[10px] text-slate-400">{log.userRole}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-600">{log.ip}</td>
                  <td className="px-4 py-2 font-mono text-[10px] text-slate-500 max-w-md break-all">{JSON.stringify(log.details)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin eventos para el filtro seleccionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reportes de publicaciones/usuarios y suspensión de cuentas (RF-32).
// ---------------------------------------------------------------------------
export const ReportsPanel: React.FC = () => {
  const { allUsers, adminSetUserSuspension, adminToggleSpaceStatus, spaces } = useApp();
  const [reports, setReports] = useState<UserReport[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    getReportsFromDb().then(setReports);
  }, []);

  const resolve = async (report: UserReport, status: UserReport['status']) => {
    setBusy(report.id);
    setError(null);
    try {
      const updated = await updateReportInDb(report.id, status, notes[report.id] ?? report.adminNotes ?? '');
      setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el reporte.');
    } finally {
      setBusy(null);
    }
  };

  const toggleSuspension = async (userId: string, suspend: boolean) => {
    const reason = suspend ? window.prompt('Motivo de la suspensión (se informa al usuario):') : '';
    if (suspend && !reason) return;
    setBusy(userId);
    setError(null);
    try {
      await adminSetUserSuspension(userId, suspend, reason || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado de la cuenta.');
    } finally {
      setBusy(null);
    }
  };

  const users = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return allUsers
      .filter((u) => u.role !== 'admin')
      .filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.rut.includes(q))
      .slice(0, 50);
  }, [allUsers, userSearch]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <div className={cardClass}>
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Reportes recibidos</h2>
          <p className="text-xs text-slate-500">Denuncias de publicaciones y usuarios enviadas por la comunidad.</p>
        </div>
        <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
          {reports.length === 0 && <li className="p-5 text-xs text-slate-400">No hay reportes.</li>}
          {reports.map((report) => {
            const space = report.targetSpaceId ? spaces.find((s) => s.id === report.targetSpaceId) : undefined;
            return (
              <li key={report.id} className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">
                    {report.targetType === 'space' ? 'Publicación' : 'Usuario'}: {report.targetLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">{report.status}</span>
                </div>
                <p className="text-slate-500">
                  {report.category} · {report.reporterEmail} · {new Date(report.createdAt).toLocaleString('es-CL')}
                </p>
                <p className="text-slate-700">{report.description}</p>
                {report.status === 'open' || report.status === 'reviewing' ? (
                  <>
                    <textarea
                      rows={2}
                      value={notes[report.id] ?? report.adminNotes ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [report.id]: e.target.value }))}
                      placeholder="Notas de la resolución"
                      className={`${inputClass} w-full`}
                    />
                    <div className="flex flex-wrap gap-2">
                      {report.status === 'open' && (
                        <button onClick={() => resolve(report, 'reviewing')} disabled={busy === report.id} className={`${inputClass} cursor-pointer`}>
                          Marcar en revisión
                        </button>
                      )}
                      <button
                        onClick={() => resolve(report, 'resolved')}
                        disabled={busy === report.id}
                        className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Resolver
                      </button>
                      <button onClick={() => resolve(report, 'dismissed')} disabled={busy === report.id} className={`${inputClass} cursor-pointer`}>
                        Desestimar
                      </button>
                      {space && space.status === 'active' && (
                        <button
                          onClick={() => adminToggleSpaceStatus(space.id, 'paused')}
                          className="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold cursor-pointer"
                        >
                          Pausar publicación
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  report.adminNotes && <p className="text-slate-500 italic">Resolución: {report.adminNotes}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cardClass}>
        <div className="p-5 border-b border-slate-100 space-y-2">
          <h2 className="text-base font-bold text-slate-900">Suspensión de cuentas</h2>
          <p className="text-xs text-slate-500">
            Una cuenta suspendida no puede iniciar sesión, reservar ni publicar, y sus publicaciones activas se pausan.
          </p>
          <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar por nombre, correo o RUT" className={`${inputClass} w-full`} />
        </div>
        <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
          {users.map((u) => (
            <li key={u.id} className="p-4 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{u.fullName}</p>
                <p className="text-slate-500 truncate">
                  {u.email} · {u.role === 'owner' ? 'Propietario' : 'Arrendatario'}
                  {u.isSuspended && <span className="text-rose-600 font-bold"> · Suspendida</span>}
                </p>
              </div>
              <button
                onClick={() => toggleSuspension(u.id, !u.isSuspended)}
                disabled={busy === u.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer shrink-0 ${
                  u.isSuspended ? 'bg-emerald-600 text-white' : 'border border-rose-300 text-rose-700'
                }`}
              >
                {busy === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : u.isSuspended ? 'Reactivar' : 'Suspender'}
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="p-4 text-[11px] font-semibold text-rose-600">{error}</p>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tablero de KPI con semáforo (Capítulo XI, Tabla 66).
// ---------------------------------------------------------------------------
const LIGHT_CLASS: Record<KpiLight, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-rose-500',
  none: 'bg-slate-300',
};

export const KpiDashboard: React.FC = () => {
  const [days, setDays] = useState(30);
  const [snapshot, setSnapshot] = useState<KpiSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getKpisFromDb(days)
      .then(setSnapshot)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron calcular los KPI.'))
      .finally(() => setLoading(false));
  }, [days]);

  const kpis = snapshot ? evaluateKpis(snapshot) : [];

  return (
    <div className={cardClass}>
      <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Indicadores clave (KPI)</h2>
          <p className="text-xs text-slate-500">
            Calculados en la base de datos a partir de reservas, contratos, verificaciones, valoraciones y visitas.
          </p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputClass}>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
      </div>
      {loading ? (
        <p className="p-5 text-xs text-slate-500">Calculando…</p>
      ) : error ? (
        <p className="p-5 text-xs text-rose-600">{error}</p>
      ) : (
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <div key={kpi.id} className="p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500">{kpi.id}</span>
                <span className={`w-3 h-3 rounded-full ${LIGHT_CLASS[kpi.light]}`} aria-label={`Semáforo ${kpi.light}`} />
              </div>
              <p className="text-xs font-bold text-slate-900">{kpi.name}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{kpi.display}</p>
              <p className="text-[11px] text-slate-500">Meta: {kpi.target}</p>
              {kpi.detail && <p className="text-[10px] text-slate-400">{kpi.detail}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Códigos de descuento (RF-21).
// ---------------------------------------------------------------------------
export const DiscountCodesPanel: React.FC = () => {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [form, setForm] = useState({ code: '', description: '', percentOff: 10, maxDiscountClp: '', validUntil: '', maxUses: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => getDiscountCodesFromDb().then(setCodes);
  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertDiscountCodeInDb({
        code: form.code,
        description: form.description || undefined,
        percentOff: Number(form.percentOff),
        maxDiscountClp: form.maxDiscountClp ? Number(form.maxDiscountClp) : undefined,
        validUntil: form.validUntil || undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        active: true,
      });
      setForm({ code: '', description: '', percentOff: 10, maxDiscountClp: '', validUntil: '', maxUses: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el código.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (code: DiscountCode) => {
    await upsertDiscountCodeInDb({ ...code, active: !code.active });
    await load();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <form onSubmit={save} className={`${cardClass} p-5 space-y-3`}>
        <h2 className="text-base font-bold text-slate-900">Nuevo código</h2>
        <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CÓDIGO" className={`${inputClass} w-full uppercase`} />
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción" className={`${inputClass} w-full`} />
        <label className="block text-xs text-slate-600">
          % de descuento sobre el arriendo
          <input type="number" min={1} max={100} required value={form.percentOff} onChange={(e) => setForm({ ...form, percentOff: Number(e.target.value) })} className={`${inputClass} w-full mt-1`} />
        </label>
        <input type="number" min={1} value={form.maxDiscountClp} onChange={(e) => setForm({ ...form, maxDiscountClp: e.target.value })} placeholder="Tope en CLP (opcional)" className={`${inputClass} w-full`} />
        <label className="block text-xs text-slate-600">
          Vigente hasta (opcional)
          <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={`${inputClass} w-full mt-1`} />
        </label>
        <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="Máximo de usos (opcional)" className={`${inputClass} w-full`} />
        {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
        <button type="submit" disabled={saving} className="w-full px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
          Guardar código
        </button>
      </form>
      <div className={`${cardClass} xl:col-span-2`}>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Descuento</th>
              <th className="px-4 py-2">Vigencia</th>
              <th className="px-4 py-2">Usos</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {codes.map((c) => (
              <tr key={c.code}>
                <td className="px-4 py-2 font-mono font-bold">
                  {c.code}
                  {c.description && <span className="block font-sans font-normal text-[10px] text-slate-500">{c.description}</span>}
                </td>
                <td className="px-4 py-2">
                  {c.percentOff}%{c.maxDiscountClp ? ` (tope ${formatClp(c.maxDiscountClp)})` : ''}
                </td>
                <td className="px-4 py-2">{c.validUntil ? `hasta ${c.validUntil}` : 'Sin vencimiento'}</td>
                <td className="px-4 py-2">
                  {c.usedCount}
                  {c.maxUses ? ` / ${c.maxUses}` : ''}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggle(c)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {c.active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pagos Webpay Plus (RF-17): conciliación de transacciones.
// ---------------------------------------------------------------------------
export const PaymentsPanel: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  useEffect(() => {
    getPaymentsFromDb().then(setPayments);
  }, []);

  return (
    <div className={cardClass}>
      <div className="p-5 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900">Transacciones Webpay Plus</h2>
        <p className="text-xs text-slate-500">Registro de órdenes de compra, autorizaciones y reversas informadas por Transbank.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Orden de compra</th>
              <th className="px-4 py-2">Reserva</th>
              <th className="px-4 py-2">Monto</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Autorización</th>
              <th className="px-4 py-2">Reversado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 whitespace-nowrap">{new Date(p.createdAt).toLocaleString('es-CL')}</td>
                <td className="px-4 py-2 font-mono">{p.buyOrder}</td>
                <td className="px-4 py-2 font-mono">{p.reservationId.slice(-8)}</td>
                <td className="px-4 py-2 tabular-nums">{formatClp(p.amountClp)}</td>
                <td className="px-4 py-2">
                  {p.status}
                  {p.environment === 'integration' && <span className="block text-[10px] text-slate-400">integración</span>}
                </td>
                <td className="px-4 py-2 font-mono">
                  {p.authorizationCode || '—'}
                  {p.cardLast4 && <span className="block text-[10px] text-slate-400">**** {p.cardLast4}</span>}
                </td>
                <td className="px-4 py-2 tabular-nums">{p.refundedAmountClp ? formatClp(p.refundedAmountClp) : '—'}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">Aún no hay transacciones.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
