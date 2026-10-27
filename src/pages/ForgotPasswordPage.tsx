import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Mail } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { useGuestOnly } from '../hooks/useGuestOnly.ts';
import { AuthAlert, AuthCard, inputClass, primaryButton } from '../components/AuthCard.tsx';

interface ForgotPasswordPageProps {
  onNavigate: (view: string) => void;
}

// Paso 1 de la recuperación: se pide el correo y el servidor envía un enlace de un solo uso.
// La respuesta es la misma exista o no la cuenta, para no revelar qué correos están registrados.
export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const { requestPasswordReset } = useApp();
  const { redirecting } = useGuestOnly();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError('Ingresa el correo electrónico con el que te registraste.');
      return;
    }
    setLoading(true);
    const r = await requestPasswordReset(clean);
    setLoading(false);
    if (r.success) setSent(r.message || 'Si el correo está registrado, te enviamos un enlace.');
    else setError(r.message || 'No se pudo enviar el enlace.');
  };

  if (redirecting) return null;

  return (
    <AuthCard
      icon={<KeyRound className="w-7 h-7" />}
      title="Recuperar contraseña"
      description="Escribe el correo de tu cuenta. Te enviaremos un enlace para crear una contraseña nueva."
    >
      {error && <AuthAlert kind="error">{error}</AuthAlert>}
      {sent ? (
        <div className="space-y-5 text-center">
          <AuthAlert kind="success">
            {sent}
            <span className="block mt-1 font-normal">El enlace vence en 1 hora y solo funciona una vez.</span>
          </AuthAlert>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button type="button" onClick={() => setSent(null)} className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer">
              Usar otro correo
            </button>
            <button type="button" onClick={() => onNavigate('login')} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-black inline-flex items-center justify-center gap-2 cursor-pointer">
              <ArrowLeft className="w-4 h-4" /> Volver a iniciar sesión
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="recovery-email" className="block text-sm font-medium text-stone-700 mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="recovery-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className={primaryButton}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{loading ? 'Enviando…' : 'Enviar enlace de recuperación'}</span>
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => onNavigate('login')} className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio de sesión
            </button>
          </div>
        </form>
      )}
    </AuthCard>
  );
};
