import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Building,
  AlertCircle,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { formatRut } from '../utils/formatters.ts';

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-fadeIn my-auto max-h-[92dvh] flex flex-col">
        {/* Encabezado con degradado moderno */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-rose-950 p-5 sm:p-7 text-white relative shrink-0">

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-rose-300 text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Transición de Rol Arrendatario → Propietario
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Conviértete en Propietario en Spotly
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1.5 leading-relaxed max-w-xl">
            Publica tus oficinas, coworkings, estudios creativos o bodegas en Chile. Monetiza tus metros cuadrados con contratos digitales protegidos por la Ley N° 18.101.
          </p>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-5 sm:p-7 space-y-5 overflow-y-auto flex-1">
          {/* Identidad del Arrendatario */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center font-bold text-slate-700">
                {currentUser.fullName.charAt(0)}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">{currentUser.fullName}</div>
                <div className="text-xs text-slate-500">
                  RUT: {formatRut(currentUser.rut)} • {currentUser.email}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
                <CheckCircle2 className="w-3 h-3" /> Identidad Vinculada
              </span>
            </div>
          </div>

          {/* Beneficios & Compromisos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <Building className="w-5 h-5 text-rose-600" />
              <div className="text-xs font-bold text-slate-900">Publicaciones Ilimitadas</div>
              <p className="text-[11px] text-slate-500">Sube fotos, define tarifas en CLP por día u hora y gestiona disponibilidad.</p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <FileText className="w-5 h-5 text-indigo-600" />
              <div className="text-xs font-bold text-slate-900">Contratos Digitales</div>
              <p className="text-[11px] text-slate-500">Firma electrónica con validez legal según Ley 19.799 para cada arriendo.</p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <div className="text-xs font-bold text-slate-900">Garantía Custodiada</div>
              <p className="text-[11px] text-slate-500">Depósitos de garantía retenidos digitalmente ante eventuales daños.</p>
            </div>
          </div>

          {/* Términos Legales & Checkboxes Obligatorios */}
          <div className="space-y-3 bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
              <Lock className="w-4 h-4 text-amber-700" />
              Acuerdo Vinculante de Propietario (Spotly Chile v2026.1)
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
                <span className="text-xs text-slate-700 leading-snug">
                  Acepto los <strong className="text-slate-900">Términos y Condiciones para Anfitriones y Propietarios</strong> de Spotly, cumpliendo con la Ley 18.101 sobre arrendamiento de predios urbanos y la normativa tributaria chilena del SII.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={declareOwnership}
                  onChange={(e) => setDeclareOwnership(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
                <span className="text-xs text-slate-700 leading-snug">
                  Declaro bajo fe de juramento ser <strong className="text-slate-900">titular legítimo, apoderado legal o subarrendador expresamente autorizado</strong> de los recintos que publicaré en la plataforma.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptFee}
                  onChange={(e) => setAcceptFee(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                />
                <span className="text-xs text-slate-700 leading-snug">
                  Acepto la comisión por servicio de intermediación del <strong className="text-slate-900">5% sobre el valor neto de cada reserva</strong> realizada a través de Spotly, descontada automáticamente al momento del pago.
                </span>
              </label>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Acciones */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
            >
              Cancelar
            </button>
            <button
              id="confirm-upgrade-owner-btn"
              type="button"
              disabled={!canSubmit || loading}
              onClick={handleUpgrade}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm ${
                canSubmit && !loading
                  ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white cursor-pointer hover:shadow-md'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                'Registrando en auditoría...'
              ) : (
                <>
                  <span>Habilitar Perfil de Propietario</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
