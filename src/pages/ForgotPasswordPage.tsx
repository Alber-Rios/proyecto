import React, { useState } from 'react';
import {
  KeyRound,
  Mail,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Building2,
  ShieldCheck,
} from 'lucide-react';

interface ForgotPasswordPageProps {
  onNavigate: (view: string) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const [emailOrRut, setEmailOrRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!emailOrRut.trim()) {
      setError('Por favor ingresa tu correo electrónico o RUT registrado.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 900);
  };

  return (
    <div className="max-w-xl mx-auto py-4 sm:py-8">
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xl p-5 sm:p-8 space-y-5">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Recuperar Contraseña</h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Ingresa tu correo electrónico o RUT asociado a tu cuenta de Spotly Chile y te enviaremos un enlace seguro para restablecer tu clave.
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {sent ? (
          <div className="space-y-6 text-center py-4 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900">¡Enlace de recuperación enviado!</h3>
              <p className="text-xs text-slate-600 max-w-xs mx-auto">
                Hemos enviado un correo a <strong>{emailOrRut}</strong> con las instrucciones para restablecer tu clave. Revisa también tu bandeja de spam.
              </p>
            </div>
            <button
              onClick={() => onNavigate('login')}
              className="px-6 py-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-2xl transition inline-flex items-center gap-2 cursor-pointer shadow-md"
            >
              <ArrowLeft className="w-4 h-4" /> Volver a Iniciar Sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Correo Electrónico o RUT
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  name="spotly_recovery_id"
                  required
                  autoComplete="off"
                  data-temp-mail-org="0"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  value={emailOrRut}
                  onChange={(e) => setEmailOrRut(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium !bg-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-2xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{loading ? 'Enviando enlace...' : 'Enviar Instrucciones de Recuperación'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Volver al Inicio de Sesión
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
