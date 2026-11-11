import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, Download, RefreshCw, Search, X, ChevronLeft, ChevronRight, Loader2, Link2 } from 'lucide-react';
import {
  searchAudit,
  verifyAuditChain,
  type AuditEntry,
  type AuditSearchResult,
  type ChainVerification,
} from '../../lib/financeApi.ts';
import { auditDetailRows, auditEntity, CATEGORY_LABEL, describeAudit, SEVERITY_LABEL } from '../../utils/auditDescribe.ts';
import { downloadCsv } from '../../utils/csv.ts';

// Panel de auditoría: bitácora de solo adición, encadenada con SHA-256.
// Búsqueda y conteos los resuelve la base (admin_audit_search) sobre todo el
// período elegido, no solo sobre la página visible.

type RangeKey = '24h' | '7d' | '30d' | '90d' | '365d';
const RANGE: Record<RangeKey, { label: string; hours: number }> = {
  '24h': { label: 'Últimas 24 horas', hours: 24 },
  '7d': { label: 'Últimos 7 días', hours: 24 * 7 },
  '30d': { label: 'Últimos 30 días', hours: 24 * 30 },
  '90d': { label: 'Últimos 90 días', hours: 24 * 90 },
  '365d': { label: 'Último año', hours: 24 * 365 },
};
const PAGE = 50;

const severityClass: Record<string, string> = {
  info: 'bg-slate-100 text-slate-800',
  warning: 'bg-amber-100 text-amber-900',
  security: 'bg-indigo-100 text-indigo-900',
  critical: 'bg-rose-100 text-rose-900',
};

const input = 'min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm';
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const AuditPanel: React.FC = () => {
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AuditSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const params = useCallback(
    (offset: number, limit = PAGE) => ({
      from: new Date(Date.now() - RANGE[rangeKey].hours * 3600_000).toISOString(),
      to: new Date().toISOString(),
      severity,
      category,
      query: appliedQuery,
      limit,
      offset,
    }),
    [rangeKey, severity, category, appliedQuery]
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    searchAudit(params(page * PAGE))
      .then(setData)
      .catch((e: Error) =>
        setError(
          /function .* does not exist|Could not find the function/i.test(e.message)
            ? 'Falta ejecutar el parche SQL supabase/actualizar-base.sql en Supabase.'
            : e.message
        )
      )
      .finally(() => setLoading(false));
  }, [params, page]);

  useEffect(load, [load]);
  useEffect(() => setPage(0), [rangeKey, severity, category, appliedQuery]);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      setChain(await verifyAuditChain());
      load();
    } catch (e: any) {
      setChain({ ok: false, checked: 0, action: e.message });
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = async () => {
    const res = await searchAudit(params(0, 500));
    downloadCsv(`Auditoria_Spotly_${new Date().toISOString().slice(0, 10)}.csv`, [
      ['N.º', 'Fecha', 'Evento', 'Descripción', 'Categoría', 'Severidad', 'Usuario', 'Rol', 'IP', 'Entidad', 'Detalle', 'Hash'],
      ...res.rows.map((r) => [
        r.seq ?? '', fmtDate(r.timestamp), r.action, describeAudit(r.action, r.details), CATEGORY_LABEL[r.category] || r.category,
        SEVERITY_LABEL[r.severity] || r.severity, r.userEmail, r.userRole, r.ip || '', auditEntity(r.details) || '',
        JSON.stringify(r.details), r.rowHash || '',
      ]),
    ]);
  };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const s = data?.last24h;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-slate-950">Auditoría</h2>
        <p className="text-sm text-slate-600">
          Todo lo importante que pasa en Spotly: accesos, pagos, reservas, verificaciones y acciones de administración. Los registros no se
          pueden editar ni borrar, y cada uno está encadenado al anterior con SHA-256.
        </p>
      </div>

      {/* Últimas 24 horas */}
      {s && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Eventos en 24 h', s.events, ''],
            ['Críticos', s.critical, s.critical > 0 ? 'text-rose-700' : ''],
            ['Inicios fallidos', s.failedLogins, s.failedLogins > 10 ? 'text-amber-800' : ''],
            ['Bloqueos', s.lockouts, s.lockouts > 0 ? 'text-amber-800' : ''],
            ['Acciones de admin', s.adminActions, ''],
            ['Pagos aprobados', s.payments, ''],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-3">
              <dt className="text-xs text-slate-600">{label}</dt>
              <dd className={`text-2xl font-bold tabular-nums text-slate-950 ${tone}`}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Integridad */}
      <section
        aria-labelledby="audit-integrity"
        className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
          chain && !chain.ok ? 'border-rose-300 bg-rose-50' : chain?.ok ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {chain && !chain.ok ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
          ) : (
            <ShieldCheck className={`mt-0.5 h-5 w-5 shrink-0 ${chain?.ok ? 'text-emerald-700' : 'text-slate-600'}`} aria-hidden="true" />
          )}
          <div className="min-w-0 text-sm" role="status">
            <p id="audit-integrity" className="font-semibold text-slate-950">
              {!chain
                ? 'Integridad de la bitácora'
                : chain.ok
                  ? `Bitácora íntegra: ${chain.checked.toLocaleString('es-CL')} registros en orden`
                  : chain.brokenSeq
                    ? `Se detectó una alteración en el registro n.º ${chain.brokenSeq}`
                    : 'No se pudo verificar la integridad'}
            </p>
            <p className="break-all text-slate-700">
              {!chain
                ? 'Recalcula el hash de cada registro y comprueba que nadie haya modificado o borrado eventos directamente en la base.'
                : chain.ok
                  ? `Último hash ${chain.lastHash?.slice(0, 16)}… · verificado ${chain.verifiedAt ? fmtDate(chain.verifiedAt) : ''}`
                  : chain.brokenSeq
                    ? `Evento ${chain.action} del ${chain.brokenAt ? fmtDate(chain.brokenAt) : ''}. Desde ese punto los registros no coinciden con su hash.`
                    : chain.action}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
        >
          {verifying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          Verificar integridad
        </button>
      </section>

      {/* Filtros */}
      <section aria-label="Filtros" className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categoría">
          {[['', 'Todo'], ...Object.entries(CATEGORY_LABEL)].map(([key, label]) => {
            const count = key ? data?.byCategory?.[key as keyof typeof data.byCategory] : data?.total;
            return (
              <button
                key={key || 'all'}
                type="button"
                aria-pressed={category === key}
                onClick={() => setCategory(key)}
                className={`min-h-10 rounded-xl border px-3 text-sm font-semibold transition cursor-pointer ${
                  category === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                }`}
              >
                {label}
                {count !== undefined && <span className={`ml-1.5 tabular-nums ${category === key ? 'text-slate-300' : 'text-slate-500'}`}>{count}</span>}
              </button>
            );
          })}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <label className="relative min-w-[16rem] flex-1">
            <span className="sr-only">Buscar en la auditoría</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Correo, IP, ID de reserva, pago, espacio o evento"
              className={`${input} w-full pl-9`}
            />
          </label>
          <label>
            <span className="sr-only">Período</span>
            <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value as RangeKey)} className={input}>
              {(Object.keys(RANGE) as RangeKey[]).map((k) => (
                <option key={k} value={k}>{RANGE[k].label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Severidad</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={input}>
              <option value="">Toda severidad</option>
              {Object.entries(SEVERITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}{data?.bySeverity?.[k as keyof typeof data.bySeverity] ? ` (${data.bySeverity[k as keyof typeof data.bySeverity]})` : ''}</option>
              ))}
            </select>
          </label>
          <button type="submit" className={`${input} font-semibold cursor-pointer`}>Buscar</button>
          <button type="button" onClick={load} className={`${input} inline-flex items-center gap-1.5 cursor-pointer`} aria-label="Actualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button type="button" onClick={handleExport} disabled={!total} className={`${input} inline-flex items-center gap-1.5 font-semibold disabled:opacity-40 cursor-pointer`}>
            <Download className="h-4 w-4" aria-hidden="true" /> CSV
          </button>
        </form>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}

      {/* Registros */}
      <section aria-label="Registros de auditoría" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">Fecha y hora</th>
                <th scope="col" className="px-4 py-2 font-semibold">Qué pasó</th>
                <th scope="col" className="px-4 py-2 font-semibold">Quién</th>
                <th scope="col" className="px-4 py-2 font-semibold">IP</th>
                <th scope="col" className="px-4 py-2 font-semibold">Entidad</th>
                <th scope="col" className="px-4 py-2 font-semibold"><span className="sr-only">Detalle</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.rows || []).map((r) => (
                <tr key={r.id} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-700">
                    {fmtDate(r.timestamp)}
                    {r.seq !== null && <span className="block text-xs text-slate-500">n.º {r.seq}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block text-slate-950">{describeAudit(r.action, r.details)}</span>
                    <span className="mt-0.5 inline-flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${severityClass[r.severity]}`}>
                        {SEVERITY_LABEL[r.severity]}
                      </span>
                      <span className="text-xs text-slate-500">{CATEGORY_LABEL[r.category]} · {r.action}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block break-all text-slate-800">{r.userEmail}</span>
                    <span className="text-xs text-slate-500">{r.userRole}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.ip || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{auditEntity(r.details) || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="min-h-9 rounded-lg border border-slate-300 px-2.5 text-sm font-semibold text-slate-800 hover:bg-white cursor-pointer"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && data && data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-600">No hay eventos con estos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
          <span className="tabular-nums">
            {total ? `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, total)} de ${total.toLocaleString('es-CL')} eventos` : 'Sin eventos'}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={`${input} inline-flex items-center disabled:opacity-40 cursor-pointer`} aria-label="Página anterior">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="self-center tabular-nums">{page + 1} / {pages}</span>
            <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className={`${input} inline-flex items-center disabled:opacity-40 cursor-pointer`} aria-label="Página siguiente">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {selected && <AuditDetail entry={selected} onClose={() => setSelected(null)} onFilter={(q) => { setQuery(q); setAppliedQuery(q); setSelected(null); }} />}
    </div>
  );
};

const AuditDetail: React.FC<{ entry: AuditEntry; onClose: () => void; onFilter: (q: string) => void }> = ({ entry, onClose, onFilter }) => {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const entity = auditEntity(entry.details);
  const rows = auditDetailRows(entry.details);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{CATEGORY_LABEL[entry.category]} · {entry.action}</p>
            <h3 id={titleId} className="text-lg font-bold text-slate-950">{describeAudit(entry.action, entry.details)}</h3>
            <p className="text-sm text-slate-600">{fmtDate(entry.timestamp)}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar detalle" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 cursor-pointer">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-5 p-5 text-sm">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
            <dt className="text-slate-600">Severidad</dt>
            <dd><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${severityClass[entry.severity]}`}>{SEVERITY_LABEL[entry.severity]}</span></dd>
            <dt className="text-slate-600">Usuario</dt>
            <dd className="break-all text-slate-900">{entry.userEmail} <span className="text-slate-500">({entry.userRole})</span></dd>
            <dt className="text-slate-600">ID de usuario</dt>
            <dd className="break-all font-mono text-xs text-slate-800">{entry.userId}</dd>
            <dt className="text-slate-600">IP</dt>
            <dd className="font-mono text-xs text-slate-800">{entry.ip || '—'}</dd>
            <dt className="text-slate-600">Navegador</dt>
            <dd className="break-all text-xs text-slate-700">{entry.userAgent || '—'}</dd>
          </dl>

          {rows.length > 0 && (
            <div>
              <h4 className="mb-2 font-semibold text-slate-900">Datos del evento</h4>
              <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-slate-50 p-3">
                {rows.map((r) => (
                  <React.Fragment key={r.key}>
                    <dt className="text-slate-600">{r.label}</dt>
                    <dd className="break-all text-slate-900">{r.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          )}

          {entity && (
            <button
              type="button"
              onClick={() => onFilter(entity)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" /> Ver todo lo relacionado con {entity}
            </button>
          )}

          <div>
            <h4 className="mb-2 font-semibold text-slate-900">Sello de integridad</h4>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-slate-600">Registro n.º</dt>
              <dd className="font-mono text-slate-800">{entry.seq ?? '—'}</dd>
              <dt className="text-slate-600">Hash</dt>
              <dd className="break-all font-mono text-slate-800">{entry.rowHash || '—'}</dd>
              <dt className="text-slate-600">Hash anterior</dt>
              <dd className="break-all font-mono text-slate-800">{entry.prevHash || 'primer registro'}</dd>
            </dl>
          </div>

          <details>
            <summary className="cursor-pointer font-semibold text-slate-800">Ver JSON original</summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(entry.details, null, 2)}</pre>
          </details>
        </div>
      </div>
    </div>
  );
};
