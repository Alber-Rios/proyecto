import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { ShieldCheck, CheckCircle2, FileText, Building, AlertCircle, ArrowRight, Landmark, Wallet } from 'lucide-react';
import { formatClp } from '../utils/formatters.ts';
import { ownerCommissionFor } from '../utils/pricing.ts';
import { DEFAULT_PLATFORM_SETTINGS, getPlatformSettings, type PlatformSettings } from '../lib/financeApi.ts';

const pct = (rate: number) => `${Math.round(rate * 1000) / 10} %`.replace('.', ',');

interface OwnerUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessNavigate: () => void;
}

export const OwnerUpgradeModal: React.FC<OwnerUpgradeModalProps> = ({
  isOpen,
  onClose,
  onSuccessNavigate,
}) => {
  const { currentUser, upgradeTenantToOwner } = useApp();

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [declareOwnership, setDeclareOwnership] = useState(false);
  const [acceptFee, setAcceptFee] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fees, setFees] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  useEffect(() => {
    if (isOpen) getPlatformSettings().then(setFees).catch(() => undefined);
  }, [isOpen]);

  const isAlreadyOwner = currentUser?.role === 'owner' || currentUser?.ownerTermsAccepted;

  useEffect(() => {
    if (isOpen && isAlreadyOwner) {
      onClose();
    }
  }, [isOpen, isAlreadyOwner, onClose]);

  if (!isOpen || !currentUser || isAlreadyOwner) return null;

  const canSubmit = acceptTerms && declareOwnership && acceptFee;

  const handleUpgrade = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      const res = await upgradeTenantToOwner(true, currentUser.verificationStatus === 'verified');
      if (res.success) {
        onClose();
        onSuccessNavigate();
      } else {
        setError(res.message);
      }
    } catch (e: any) {
      setError(e.message || 'Error al procesar la actualización de perfil.');
    } finally {
      setLoading(false);
    }
  };

  const verified = currentUser.verificationStatus === 'verified';
  const exampleRent = 20000;
  const exampleCommission = ownerCommissionFor(exampleRent, fees.ownerCommissionRate);

  const check = (checked: boolean, onChange: (v: boolean) => void, children: React.ReactNode) => (
    <label className="flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-white cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-rose-600 cursor-pointer"
      />
      <span className="text-sm leading-snug text-slate-700">{children}</span>
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-upgrade-title"
    >
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-fadeIn my-auto max-h-[92dvh] flex flex-col">
        <div className="bg-slate-950 p-5 sm:p-7 text-white shrink-0">
          <h2 id="owner-upgrade-title" className="text-xl sm:text-2xl font-bold tracking-tight">
            Publica tus espacios en Spotly
          </h2>
          <p className="text-slate-300 text-sm mt-1.5 leading-relaxed">
            Oficinas, estudios, salas o bodegas: arriéndalos por hora, día o mes. Publicar es gratis; solo pagas comisión cuando arriendas.
          </p>
        </div>

        <div className="p-5 sm:p-7 space-y-5 overflow-y-auto flex-1">
          {/* Cómo funciona */}
          <ol className="grid gap-2 sm:grid-cols-3 sm:gap-3">
            {[
              { icon: Building, title: 'Publicas gratis', text: 'Fotos, precios y horarios. Lo revisamos antes de mostrarlo.' },
              { icon: FileText, title: 'Cada arriendo con contrato', text: 'Firma electrónica y pago con Webpay antes de usar el espacio.' },
              { icon: Wallet, title: 'Recibes los martes', text: `Se descuenta la comisión (${pct(fees.ownerCommissionRate)} + IVA) y el resto va a tu cuenta.` },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-xl border border-slate-200 p-3 sm:block sm:space-y-1 sm:p-3.5">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 sm:mt-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-slate-900">{title}</p>
                  <p className="text-xs leading-relaxed text-slate-600">{text}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Lo que vas a necesitar */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-900">Lo que vas a necesitar</p>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="flex items-center gap-2.5 text-slate-700">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /> Identidad verificada
                </span>
                {verified ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Lista
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-amber-700">
                    {currentUser.verificationStatus === 'pending_review' ? 'En revisión' : 'Pendiente'}
                  </span>
                )}
              </li>
              <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="flex items-center gap-2.5 text-slate-700">
                  <Landmark className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /> Inicio de actividades en el SII (o declarar que no estás obligado)
                </span>
                <span className="shrink-0 text-xs text-slate-500">Al publicar</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="flex items-center gap-2.5 text-slate-700">
                  <Wallet className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /> Cuenta bancaria para tus depósitos
                </span>
                <span className="shrink-0 text-xs text-slate-500">En Billetera</span>
              </li>
            </ul>
          </div>

          {/* Acuerdo */}
          <fieldset className="space-y-1 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
            <legend className="px-1 text-sm font-bold text-slate-900">Antes de continuar, confirma</legend>
            {check(
              declareOwnership,
              setDeclareOwnership,
              <>Soy el <strong className="text-slate-900">dueño</strong> de los espacios que publicaré, o tengo <strong className="text-slate-900">autorización por escrito</strong> del dueño para arrendarlos.</>,
            )}
            {check(
              acceptFee,
              setAcceptFee,
              <>
                Acepto la comisión de Spotly: <strong className="text-slate-900">{pct(fees.ownerCommissionRate)} del arriendo más IVA</strong>. Por ejemplo, en un arriendo de{' '}
                {formatClp(exampleRent)} son {formatClp(exampleCommission)}. Se descuenta al liquidar y el resto se deposita los martes.
              </>,
            )}
            {check(
              acceptTerms,
              setAcceptTerms,
              <>
                Acepto los{' '}
                <a href="/terminos" target="_blank" rel="noopener noreferrer" className="font-semibold text-rose-700 underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
                  Términos y condiciones
                </a>{' '}
                y entiendo que mis impuestos son mi responsabilidad: Spotly revisará mi situación en el SII, como exige la Ley 21.713.
              </>,
            )}
          </fieldset>

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-11 px-5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-sm font-semibold transition cursor-pointer"
            >
              Ahora no
            </button>
            <button
              id="confirm-upgrade-owner-btn"
              type="button"
              disabled={!canSubmit || loading}
              onClick={handleUpgrade}
              className="w-full sm:w-auto min-h-11 px-6 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 bg-rose-600 text-white hover:bg-rose-700 cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {loading ? 'Activando…' : (
                <>
                  <span>Activar mi perfil de propietario</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
          {!canSubmit && <p className="text-center text-xs text-slate-500 sm:text-right">Marca las tres casillas para continuar.</p>}
        </div>
      </div>
    </div>
  );
};
