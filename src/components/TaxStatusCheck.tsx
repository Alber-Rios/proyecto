import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ExternalLink, FileSignature, FileText, Loader2, Upload } from 'lucide-react';
import {
  SII_TAX_FOLDER_URL,
  declareTaxExemption,
  getTaxCertificateUrl,
  taxValidUntil,
  submitTaxCertificate,
  taxReviewDue,
  taxStatusOk,
  type TaxStatus,
} from '../lib/financeApi.ts';
import { useApp } from '../context/AppContext.tsx';

const fmtDate = (d: string | Date | null) =>
  d ? (d instanceof Date ? d : new Date(`${d.slice(0, 10)}T12:00:00`)).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/**
 * Situación tributaria del propietario (Ley 21.713).
 * El propietario sube su carpeta tributaria electrónica del SII y un administrador la
 * revisa. Para publicar: inicio de actividades, o declarar que no está obligado
 * (solo sin amoblar). Para amoblado (cobra IVA): inicio de actividades y cumplimiento
 * al día. La carpeta se pide de nuevo cada 90 días.
 */
export const TaxStatusCheck: React.FC<{
  status: TaxStatus | null;
  loading?: boolean;
  /** El espacio (o alguno de sus espacios) es amoblado: necesita cumplimiento al día. */
  furnished?: boolean;
  onChange: (status: TaxStatus) => void;
}> = ({ status, loading, furnished, onChange }) => {
  const { currentUser } = useApp();
  const [busy, setBusy] = useState<'upload' | 'declare' | 'view' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmExempt, setConfirmExempt] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Revisando tu situación tributaria…
      </p>
    );
  }

  const upload = async (file: File | undefined) => {
    if (!file || !currentUser) return;
    setBusy('upload');
    setError(null);
    const r = await submitTaxCertificate(currentUser.id, file);
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
    if (r.success && r.status) onChange(r.status);
    else setError(r.message || 'No se pudo subir el archivo. Inténtalo de nuevo.');
  };

  const declare = async () => {
    setBusy('declare');
    setError(null);
    const r = await declareTaxExemption();
    setBusy(null);
    if (r.success && r.status) onChange(r.status);
    else setError(r.message || 'No se pudo registrar. Inténtalo de nuevo.');
  };

  const viewFile = async () => {
    if (!status?.certificatePath) return;
    setBusy('view');
    const url = await getTaxCertificateUrl(status.certificatePath);
    setBusy(null);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setError('No se pudo abrir el archivo.');
  };

  const ok = taxStatusOk(status);
  const pending = status?.reviewStatus === 'pending';
  const rejected = status?.reviewStatus === 'rejected';
  const reviewed = status?.reviewStatus === 'reviewed' || status?.source === 'admin';
  const due = status ? taxReviewDue(status) : true;
  const exemptOnly = Boolean(status?.exemptDeclared && !status.hasActivity);

  type State = 'ok' | 'pending' | 'rejected' | 'semester' | 'debt' | 'exempt' | 'noActivity' | 'start';
  const state: State = ok
    ? 'ok'
    : pending
      ? 'pending'
      : rejected
        ? 'rejected'
        : status?.hasActivity && due
          ? 'semester'
          : status?.hasActivity && !status.upToDate
            ? 'debt'
            : exemptOnly && !furnished
              ? 'exempt'
              : reviewed && !status?.hasActivity
                ? 'noActivity'
                : 'start';

  const tone: Record<State, string> = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    pending: 'border-sky-200 bg-sky-50 text-sky-950',
    rejected: 'border-rose-200 bg-rose-50 text-rose-950',
    semester: 'border-amber-300 bg-amber-50 text-amber-950',
    debt: 'border-rose-200 bg-rose-50 text-rose-950',
    exempt: 'border-slate-200 bg-slate-50 text-slate-800',
    noActivity: 'border-rose-200 bg-rose-50 text-rose-950',
    start: 'border-sky-200 bg-sky-50 text-sky-950',
  };

  const showUpload = state !== 'ok' && state !== 'pending';
  const showExempt = !furnished && !status?.exemptDeclared && !status?.hasActivity && state !== 'ok';
  const uploadLabel = state === 'start' || state === 'exempt' ? 'Subir carpeta tributaria' : 'Subir carpeta actualizada';

  return (
    <div role="status" aria-live="polite" className={`space-y-2.5 rounded-xl border p-3 text-xs leading-relaxed ${tone[state]}`}>
      {state === 'ok' && status && (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="font-semibold">Inicio de actividades y cumplimiento tributario al día.</p>
            {status.activityName && (
              <p>
                Giro {status.activityCode} · {status.activityName}
              </p>
            )}
            <p className="opacity-80">
              Revisado por Spotly el {fmtDate(status.checkedAt)}. Vale hasta el {fmtDate(taxValidUntil(status))}; ahí te pediremos una nueva.
            </p>
          </div>
        </div>
      )}

      {state === 'pending' && status && (
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Recibimos tu carpeta tributaria{status.certificateUploadedAt ? ` el ${fmtDate(status.certificateUploadedAt)}` : ''}.</strong>{' '}
            Ya puedes publicar: tu espacio queda en revisión y el administrador revisa ambos antes de aprobarlo (menos de 48 horas).
          </p>
        </div>
      )}

      {state === 'rejected' && status && (
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Rechazamos tu archivo.</strong> Motivo: {status.reviewNote || 'no se pudo validar'}. Súbelo de nuevo.
          </p>
        </div>
      )}

      {state === 'semester' && (
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Tu carpeta tributaria venció.</strong> La pedimos cada 90 días: sube una actualizada. Mientras
            tanto, de tus arriendos amoblados se retiene un anticipo de IVA.
          </p>
        </div>
      )}

      {state === 'debt' && (
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Tu carpeta muestra incumplimientos tributarios</strong> (por ejemplo, declaraciones de IVA
            atrasadas). Puedes publicar sin amoblar, pero no amoblado, y de tus arriendos amoblados se retiene un anticipo de IVA. Regulariza en el
            SII y sube tu carpeta actualizada.
          </p>
        </div>
      )}

      {state === 'exempt' && status && (
        <div className="flex items-start gap-2">
          <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Declaraste que no estás obligado a iniciar actividades</strong>
            {status.exemptDeclaredAt ? ` (${fmtDate(status.exemptDeclaredAt)})` : ''}. Puedes publicar espacios sin amoblar. Si después haces el
            trámite, sube tu carpeta tributaria para publicar amoblado.
          </p>
        </div>
      )}

      {state === 'noActivity' && (
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Tu carpeta tributaria no muestra inicio de actividades.</strong>{' '}
            {furnished
              ? 'Sin eso no puedes cobrar IVA ni publicar amoblado. Desmárcalo para publicar sin amoblar, o haz el trámite en el SII y sube tu carpeta de nuevo.'
              : 'Haz el trámite en el SII y sube tu carpeta de nuevo, o, si arriendas de forma ocasional un espacio sin amoblar, declara que no estás obligado.'}
          </p>
        </div>
      )}

      {state === 'start' && (
        <p>
          <strong className="font-semibold">Antes de publicar, sube tu carpeta tributaria del SII.</strong> Por ley debemos verificar tu inicio de
          actividades{furnished ? ' y que tus impuestos estén al día' : ''}. Un administrador la revisa en menos de 48 horas.
        </p>
      )}

      {showUpload && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            id="tax-certificate-input"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
          >
            {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {busy === 'upload' ? 'Subiendo…' : uploadLabel}
          </button>
          <a href={SII_TAX_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
            Cómo descargarla <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <span className="w-full opacity-75">PDF, JPG o PNG, hasta 5 MB. La descargas gratis en sii.cl.</span>
        </div>
      )}

      {showExempt && (
        <>
          <label className="flex items-start gap-2 rounded-lg bg-white/70 p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmExempt}
              onChange={(e) => setConfirmExempt(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
            />
            <span>
              <strong>O, si no tienes inicio de actividades:</strong> declaro que mi actividad no está sujeta a la obligación de iniciar actividades
              ante el SII (por ejemplo, arriendo ocasional de un inmueble sin amoblar) y que la información es verdadera.
            </span>
          </label>
          <button
            type="button"
            onClick={declare}
            disabled={!confirmExempt || busy !== null}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {busy === 'declare' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileSignature className="h-4 w-4" aria-hidden="true" />}
            Registrar mi declaración
          </button>
        </>
      )}

      {status?.certificatePath && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={viewFile}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline disabled:opacity-50 cursor-pointer"
          >
            {busy === 'view' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
            Ver archivo enviado
          </button>
          {state === 'pending' && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="font-semibold underline-offset-2 hover:underline disabled:opacity-50 cursor-pointer"
            >
              Cambiar archivo
            </button>
          )}
        </div>
      )}
      {state === 'pending' && (
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          aria-label="Cambiar carpeta tributaria"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      )}

      {error && <p className="font-semibold text-rose-700">{error}</p>}
    </div>
  );
};
