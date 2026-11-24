import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ExternalLink, FileSignature, Loader2, Search } from 'lucide-react';
import {
  checkMyTaxStatus,
  declareTaxExemption,
  nextTaxReview,
  taxReviewDue,
  taxStatusOk,
  type TaxStatus,
} from '../lib/financeApi.ts';

const fmtDate = (d: string | Date | null) =>
  d ? (d instanceof Date ? d : new Date(`${d.slice(0, 10)}T12:00:00`)).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtDateTime = (d: string) => new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Situación tributaria del propietario (Ley 21.713), con consulta SIMULADA al SII.
 * - Para publicar: inicio de actividades vigente, o declarar que no está obligado.
 * - Para publicar amoblado (cobra IVA): inicio de actividades y cumplimiento al día.
 * - Revisión obligatoria cada semestre (enero y julio).
 */
export const TaxStatusCheck: React.FC<{
  status: TaxStatus | null;
  loading?: boolean;
  /** El espacio (o alguno de sus espacios) es amoblado: necesita cumplimiento al día. */
  furnished?: boolean;
  onChange: (status: TaxStatus) => void;
}> = ({ status, loading, furnished, onChange }) => {
  const [busy, setBusy] = useState<'check' | 'declare' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmExempt, setConfirmExempt] = useState(false);

  const run = async (what: 'check' | 'declare') => {
    setBusy(what);
    setError(null);
    const r = what === 'check' ? await checkMyTaxStatus() : await declareTaxExemption();
    setBusy(null);
    if (r.success && r.status) onChange(r.status);
    else setError(r.message || 'No se pudo completar. Inténtalo de nuevo.');
  };

  const checkButton = (label: string) => (
    <button
      type="button"
      onClick={() => run('check')}
      disabled={busy !== null}
      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
    >
      {busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
      {busy === 'check' ? 'Consultando al SII…' : label}
    </button>
  );

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Revisando tu situación tributaria…
      </p>
    );
  }

  const ok = taxStatusOk(status);
  const due = status ? taxReviewDue(status) : false;
  const tone = !status
    ? 'border-sky-200 bg-sky-50 text-sky-950'
    : ok
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : due && status.hasActivity
        ? 'border-amber-300 bg-amber-50 text-amber-950'
        : status.exemptDeclared && !status.hasActivity && !furnished
          ? 'border-slate-200 bg-slate-50 text-slate-800'
          : 'border-rose-200 bg-rose-50 text-rose-950';

  return (
    <div role="status" aria-live="polite" className={`space-y-2.5 rounded-xl border p-3 text-xs leading-relaxed ${tone}`}>
      {/* Sin consultar */}
      {!status && (
        <>
          <p>
            <strong className="font-semibold">Antes de publicar revisamos tu situación en el SII.</strong> Por ley, Spotly debe verificar que tengas
            inicio de actividades {furnished ? 'y tus impuestos al día (un espacio amoblado cobra IVA)' : 'o registrar que no estás obligado a tenerlo'}.
          </p>
          {checkButton('Revisar mi situación tributaria')}
        </>
      )}

      {/* Al día */}
      {status && ok && (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="font-semibold">Inicio de actividades y cumplimiento tributario al día.</p>
            {status.activityName && (
              <p>
                Giro {status.activityCode} · {status.activityName}
                {status.activityStart ? ` · desde el ${fmtDate(status.activityStart)}` : ''}
              </p>
            )}
            <p className="opacity-80">
              Revisado el {fmtDateTime(status.checkedAt)}. Próxima revisión: {fmtDate(nextTaxReview())}.
            </p>
          </div>
        </div>
      )}

      {/* Revisión semestral pendiente */}
      {status && !ok && due && status.hasActivity && (
        <>
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p>
              <strong className="font-semibold">Toca tu revisión semestral.</strong> Cada enero y julio volvemos a verificar tu cumplimiento
              tributario. Mientras no la hagas, de tus arriendos amoblados se retiene un anticipo de IVA.
            </p>
          </div>
          {checkButton('Revisar ahora')}
        </>
      )}

      {/* Con inicio, pero con incumplimiento */}
      {status && !due && status.hasActivity && !status.upToDate && (
        <>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <p>
              <strong className="font-semibold">El SII informa incumplimientos tributarios en tu RUT</strong> (por ejemplo, declaraciones de IVA
              atrasadas). Puedes publicar sin amoblar, pero no amoblado, y de tus arriendos amoblados se retiene un anticipo de IVA de hasta 19 %
              que puedes descontar en tu declaración. Regulariza en el SII y vuelve a revisar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {checkButton('Volver a revisar')}
            <SiiLink />
          </div>
        </>
      )}

      {/* Sin inicio de actividades */}
      {status && !status.hasActivity && (
        <>
          {status.exemptDeclared && !furnished ? (
            <div className="flex items-start gap-2">
              <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
              <p>
                <strong className="font-semibold">Declaraste que no estás obligado a iniciar actividades</strong>
                {status.exemptDeclaredAt ? ` (${fmtDate(status.exemptDeclaredAt)})` : ''}. Puedes publicar espacios sin amoblar. Spotly informa esta
                declaración al SII.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
              <p>
                <strong className="font-semibold">Tu RUT no tiene inicio de actividades en el SII.</strong>{' '}
                {furnished
                  ? 'Sin eso no puedes cobrar IVA, así que no puedes publicar este espacio como amoblado. Desmárcalo para publicarlo sin amoblar, o haz el trámite y vuelve a revisar.'
                  : 'Haz el trámite en el SII, o, si arriendas de forma ocasional un espacio sin amoblar, declara que no estás obligado.'}
              </p>
            </div>
          )}

          {!furnished && !status.exemptDeclared && (
            <label className="flex items-start gap-2 rounded-lg bg-white/70 p-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmExempt}
                onChange={(e) => setConfirmExempt(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
              />
              <span>
                Declaro que mi actividad <strong>no está sujeta a la obligación de iniciar actividades</strong> ante el SII (por ejemplo, arriendo
                ocasional de un inmueble sin amoblar), y que la información es verdadera. Spotly registrará esta declaración y la informará al SII.
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {!furnished && !status.exemptDeclared && (
              <button
                type="button"
                onClick={() => run('declare')}
                disabled={!confirmExempt || busy !== null}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {busy === 'declare' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSignature className="h-4 w-4" aria-hidden="true" />}
                Registrar mi declaración
              </button>
            )}
            {checkButton('Volver a revisar')}
            <SiiLink />
          </div>
        </>
      )}

      {status?.simulated && (
        <p className="text-[11px] opacity-75">Consulta simulada para el proyecto de título; en producción se conecta a la API del SII (Ley 21.713).</p>
      )}
      {error && <p className="font-semibold text-rose-700">{error}</p>}
    </div>
  );
};

const SiiLink: React.FC = () => (
  <a href="https://www.sii.cl" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline">
    Trámites en sii.cl <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
  </a>
);
