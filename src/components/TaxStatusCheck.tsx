import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Search } from 'lucide-react';
import { checkMyTaxStatus, taxStatusOk, type TaxStatus } from '../lib/financeApi.ts';

const fmtDate = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL') : '');
const fmtDateTime = (d: string) => new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Consulta (simulada) de inicio de actividades en el SII, necesaria para publicar
 * un espacio amoblado: solo quien tiene inicio de actividades al día puede cobrar IVA.
 */
export const TaxStatusCheck: React.FC<{
  status: TaxStatus | null;
  loading?: boolean;
  onChange: (status: TaxStatus) => void;
}> = ({ status, loading, onChange }) => {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    setError(null);
    const r = await checkMyTaxStatus();
    setChecking(false);
    if (r.success && r.status) onChange(r.status);
    else setError(r.message || 'No se pudo consultar. Inténtalo de nuevo.');
  };

  const button = (label: string) => (
    <button
      type="button"
      onClick={check}
      disabled={checking}
      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
    >
      {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
      {checking ? 'Consultando al SII…' : label}
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
  return (
    <div
      role="status"
      aria-live="polite"
      className={`space-y-2 rounded-xl border p-3 text-xs ${
        !status ? 'border-sky-200 bg-sky-50 text-sky-950' : ok ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-rose-200 bg-rose-50 text-rose-950'
      }`}
    >
      {!status && (
        <>
          <p>
            <strong className="font-semibold">Para cobrar IVA necesitas inicio de actividades en el SII.</strong> Revisamos con tu RUT si lo tienes
            y si estás al día.
          </p>
          {button('Revisar mi situación tributaria')}
        </>
      )}

      {status && ok && (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="font-semibold">Tienes inicio de actividades al día: puedes cobrar IVA.</p>
            {status.activityName && (
              <p>
                Giro {status.activityCode} · {status.activityName}
                {status.activityStart ? ` · desde el ${fmtDate(status.activityStart)}` : ''}
              </p>
            )}
            <p className="text-emerald-800/80">Consultado el {fmtDateTime(status.checkedAt)}</p>
          </div>
        </div>
      )}

      {status && !ok && (
        <>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <p>
              <strong className="font-semibold">
                {status.hasActivity ? 'Tu situación tributaria no está al día.' : 'Tu RUT no tiene inicio de actividades en el SII.'}
              </strong>{' '}
              Sin eso no puedes cobrar IVA, así que no puedes publicar este espacio como amoblado. Desmarca la casilla para publicarlo sin amoblar
              (exento de IVA), o haz el trámite y vuelve a revisar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {button('Volver a revisar')}
            <a
              href="https://www.sii.cl"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline"
            >
              Inicio de actividades en sii.cl <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </>
      )}

      {status?.simulated && (
        <p className="text-[11px] opacity-75">Consulta simulada para el proyecto de título; en producción se conecta a un servicio del SII.</p>
      )}
      {error && <p className="font-semibold text-rose-700">{error}</p>}
    </div>
  );
};
